# Contract: Pet skills + photo upload route

## `addPet(ctx, input): Promise<Pet>`

**Input**: `{ propiedad_id, nombre }` (photo is handled separately — see below)

**Behavior**: Insert a `mascotas` row with `foto_path = null`. No device interaction of
any kind (FR-006) — this skill never touches `SmsGatewayPort` or `SchedulerPort`.

## `removePet(ctx, petId): Promise<void>`

**Behavior**: Delete the `mascotas` row, then delete its Storage object (if
`foto_path` is set) — in that order isn't required for correctness (the row and the
photo have no foreign-key relationship a partial failure could corrupt), but the
photo delete MUST be attempted even if best-effort, so removal doesn't orphan storage
(FR-012).

## `POST /api/pets/photo` (web route, not a domain skill)

**Request**: `multipart/form-data` with fields `pet_id` and `photo` (image file).

**Behavior**:
1. `getCurrentResident()` — authorization boundary, same as every other resident
   action.
2. Confirm the `pet_id` belongs to the caller's own property (RLS backs this up, but
   the explicit check gives a clear error message rather than a generic RLS denial).
3. Validate file size and format server-side (FR-011) — reject with a specific
   message (e.g. "La foto no puede superar 5MB" / "Formato no soportado, usa JPG o
   PNG") rather than a generic upload failure.
4. Upload to the `mascotas-fotos` bucket at `{propiedad_id}/{pet_id}.{ext}` via the
   service-role client (research.md: server-side proxy, not direct client→Storage).
5. Update the `mascotas` row's `foto_path`.

**Response**: `200` with the object's path/public URL on success; `400` with the
specific validation message on rejection (research.md).
