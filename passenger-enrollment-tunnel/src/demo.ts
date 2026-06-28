/**
 * End-to-end demo of the FNRH tunnel against in-memory/fake adapters — no DB,
 * no SNRHos, no OCR engine. Mirrors the Access Layer's `src/demo.ts`.
 *
 * Flow: reservation -> pre-check-in ficha -> document scan -> attempted check-in
 * during an SNRHos outage (-> CONTINGENCY) -> service recovers -> drain queue
 * (-> REGISTERED). Prints the ficha state and the LGPD audit trail.
 *
 *   npx tsx passenger-enrollment-tunnel/src/demo.ts
 */
import { InMemoryStore } from "./mcp/store/in_memory.js";
import { FakeSnrhos } from "./mcp/snrhos/fake.js";
import { FakeOcr } from "./mcp/ocr/fake.js";
import { makeContext } from "./skills/context.js";
import { createFicha } from "./skills/create_ficha.js";
import { scanDocument } from "./skills/scan_document.js";
import { registerCheckin, drainContingency } from "./orchestration/snrhos_sync.js";
import {
  DocumentType,
  MedioTransporte,
  MotivoViaje,
  SnrhosResultStatus,
} from "./shared/enums.js";

async function main(): Promise<void> {
  const store = new InMemoryStore();
  const snrhos = new FakeSnrhos();
  const ocr = new FakeOcr();
  const ctx = makeContext({ store, snrhos, ocr });

  // 1) PMS "reservation created" -> ficha in DRAFT + (real adapter) link sent.
  const ficha = await createFicha(ctx, {
    reservaLocalizador: "RSV-2026-0420",
    contactoTitular: "+5521999990000",
  });
  console.log(`1. Ficha creada       -> ${ficha.estado}`);

  // 2) Guest scans passport + completes the 2-tap statistical form.
  const captured = await scanDocument(ctx, {
    fichaId: ficha.id,
    scan: { image: "<bytes>", hint: DocumentType.PASSPORT },
    estadisticos: {
      motivoViaje: MotivoViaje.TURISMO,
      medioTransporte: MedioTransporte.AVION,
      puntoOrigen: "Buenos Aires",
      proximoDestino: "Rio de Janeiro",
    },
  });
  console.log(`2. Documento escaneado -> ${captured.estado}`);

  // 3) SNRHos is down (5xx): the desk must not be blocked -> CONTINGENCY.
  snrhos.nextResults.push({ status: SnrhosResultStatus.SERVER_ERROR, httpStatus: 503 });
  const contingency = await registerCheckin(ctx, ficha.id);
  console.log(
    `3. Check-in con Serpro caído -> ${contingency.estado} (llave entregada igual)`,
  );

  // 4) SNRHos recovers: drain the queue, regularizing the legal state.
  const { drained, pending } = await drainContingency(ctx);
  const finalFicha = await store.fichas.get(ficha.id);
  console.log(
    `4. Cola drenada (${drained} ok, ${pending} pend.) -> ${finalFicha?.estado}` +
      ` (protocolo ${finalFicha?.protocoloSnrhos})`,
  );

  console.log("\nBitácora LGPD (sin PII):");
  for (const e of await store.events.listForFicha(ficha.id)) {
    console.log(`  - ${e.tipo} ${JSON.stringify(e.payload)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
