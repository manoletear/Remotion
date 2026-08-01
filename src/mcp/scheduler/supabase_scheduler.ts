import type { SupabaseClient } from "@supabase/supabase-js";

import { newId } from "../../shared/utils.js";
import type {
  ScheduledEntityType,
  ScheduledJob,
  ScheduledKind,
  SchedulerPort,
} from "./port.js";

const TABLE = "jobs";

interface JobRow {
  id: string;
  kind: ScheduledKind;
  entity_type: ScheduledEntityType;
  entity_id: string;
  run_at: string;
}

/**
 * Durable scheduler backed by a Supabase `jobs` table. Survives process
 * restarts (unlike InMemoryScheduler), so scheduled activations/expirations are
 * not lost. A cron job or worker polls `due()` and calls `complete()`.
 *
 * Schema: supabase/migrations/0002_scheduler_jobs.sql,
 * 0006_household_permanent_access.sql (entity_type/entity_id).
 */
export class SupabaseScheduler implements SchedulerPort {
  constructor(private readonly db: SupabaseClient) {}

  async schedule(
    kind: ScheduledKind,
    entityType: ScheduledEntityType,
    entityId: string,
    runAt: Date,
  ): Promise<ScheduledJob> {
    // Replace any pending job of the same kind for this entity.
    await this.db
      .from(TABLE)
      .delete()
      .eq("entity_id", entityId)
      .eq("kind", kind)
      .eq("status", "PENDING");

    const row = {
      id: newId(),
      kind,
      entity_type: entityType,
      entity_id: entityId,
      run_at: runAt.toISOString(),
      status: "PENDING",
    };
    const res = await this.db.from(TABLE).insert(row).select().single();
    if (res.error) throw new Error(res.error.message);
    return toJob(res.data as JobRow);
  }

  async cancel(entityId: string, kind?: ScheduledKind): Promise<void> {
    let q = this.db
      .from(TABLE)
      .delete()
      .eq("entity_id", entityId)
      .eq("status", "PENDING");
    if (kind) q = q.eq("kind", kind);
    const res = await q;
    if (res.error) throw new Error(res.error.message);
  }

  async due(now: Date = new Date()): Promise<ScheduledJob[]> {
    const res = await this.db
      .from(TABLE)
      .select()
      .eq("status", "PENDING")
      .lte("run_at", now.toISOString())
      .order("run_at", { ascending: true });
    if (res.error) throw new Error(res.error.message);
    return (res.data as JobRow[]).map(toJob);
  }

  async complete(jobId: string): Promise<void> {
    const res = await this.db.from(TABLE).update({ status: "DONE" }).eq("id", jobId);
    if (res.error) throw new Error(res.error.message);
  }
}

function toJob(row: JobRow): ScheduledJob {
  return {
    id: row.id,
    kind: row.kind,
    entityType: row.entity_type,
    entityId: row.entity_id,
    runAt: row.run_at,
  };
}
