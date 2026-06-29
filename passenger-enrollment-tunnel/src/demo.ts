/**
 * End-to-end demo of the FNRH tunnel against in-memory/fake adapters — no DB,
 * no SNRHos, no OCR engine. Club Med profile: international guest arriving by
 * plane at a Brazilian village.
 *
 * Shows the three things that actually matter:
 *  1. The document (MRZ) gives identity but NOT domicilio/profesión.
 *  2. Those off-document fields come from the form/PMS; if missing, the
 *     completeness gate blocks the send (no wasted 4xx).
 *  3. An SNRHos outage parks the ficha in CONTINGENCY and the drain recovers it.
 *
 *   npx tsx passenger-enrollment-tunnel/src/demo.ts
 */
import { InMemoryStore } from "./mcp/store/in_memory.js";
import { FakeSnrhos } from "./mcp/snrhos/fake.js";
import { FakeOcr } from "./mcp/ocr/fake.js";
import { FakeCatalog } from "./mcp/catalog/fake.js";
import { makeContext } from "./skills/context.js";
import { createFicha } from "./skills/create_ficha.js";
import { scanDocument, type ComplementaryData } from "./skills/scan_document.js";
import { confirmFicha } from "./skills/confirm_ficha.js";
import { registerCheckin, drainContingency } from "./orchestration/snrhos_sync.js";
import { OFF_DOCUMENT_MANDATORY } from "./domain/fnrh_requirements.js";
import {
  DocumentType,
  MedioTransporte,
  MotivoViaje,
  SnrhosResultStatus,
} from "./shared/enums.js";

const estadisticos = {
  motivoViaje: MotivoViaje.TURISMO,
  medioTransporte: MedioTransporte.AVION,
  puntoOrigen: "Buenos Aires",
  proximoDestino: "Rio de Janeiro",
};

/** What the form/PMS supplies — none of this is on the passport. */
const complementariosCompletos: ComplementaryData = {
  profesion: "Ingeniera",
  domicilio: {
    pais: "ARG",
    estado: "Buenos Aires",
    municipio: "CABA",
    logradouro: "Av. Corrientes 1234",
    cep: null,
  },
  email: "ana@example.com",
  telefono: "+5491150001234",
};

async function main(): Promise<void> {
  const store = new InMemoryStore();
  const snrhos = new FakeSnrhos();
  const ocr = new FakeOcr();
  const catalog = new FakeCatalog();
  const ctx = makeContext({ store, snrhos, ocr, catalog });

  console.log(
    "Campos OBLIGATORIOS que NO están en ningún documento:\n  " +
      OFF_DOCUMENT_MANDATORY.map((f) => f.label).join("\n  ") +
      "\n",
  );

  // --- Caso A: huésped completo, con caída de SNRHos en medio ---
  const ficha = await createFicha(ctx, {
    reservaLocalizador: "CM-TRANCOSO-0420",
    contactoTitular: "+5521999990000",
  });
  console.log(`A1. Ficha creada (Club Med Trancoso) -> ${ficha.estado}`);

  const capturedA = await scanDocument(ctx, {
    fichaId: ficha.id,
    scan: { image: "<bytes>", hint: DocumentType.PASSPORT },
    estadisticos,
    complementarios: complementariosCompletos,
  });
  console.log(
    `A2. Pasaporte (MRZ) pre-llena el nombre -> "${capturedA.hospede?.pessoa.nombreCompleto}" (sin tildes)`,
  );

  // Confirmar y corregir: el huésped repone las tildes; la agencia (PMS) había
  // escrito el motivo como texto libre "vacaciones" -> el catálogo lo traduce.
  const confirmed = await confirmFicha(ctx, {
    fichaId: ficha.id,
    nombreCompleto: "Ana María Silva",
    motivo: "vacaciones",
  });
  console.log(
    `A3. Confirmar y corregir -> "${confirmed.hospede?.pessoa.nombreCompleto}"` +
      ` | motivo "vacaciones" => ${confirmed.hospede?.estadisticos.motivoViaje}`,
  );

  snrhos.nextResults.push({ status: SnrhosResultStatus.SERVER_ERROR, httpStatus: 503 });
  const contingency = await registerCheckin(ctx, ficha.id);
  console.log(
    `A4. Check-in con Serpro caído -> ${contingency.estado} (llave entregada igual)`,
  );

  const { drained } = await drainContingency(ctx);
  const finalA = await store.fichas.get(ficha.id);
  console.log(
    `A5. Cola drenada (${drained} ok) -> ${finalA?.estado} (protocolo ${finalA?.protocoloSnrhos})\n`,
  );

  // --- Caso B: falta el domicilio -> el gate de completitud bloquea el envío ---
  const fichaB = await createFicha(ctx, {
    reservaLocalizador: "CM-RIODASPEDRAS-0420",
    contactoTitular: "+5521988887777",
  });
  await scanDocument(ctx, {
    fichaId: fichaB.id,
    scan: { image: "<bytes>", hint: DocumentType.PASSPORT },
    estadisticos,
    complementarios: { ...complementariosCompletos, domicilio: null, profesion: null },
  });
  try {
    await registerCheckin(ctx, fichaB.id);
  } catch (err) {
    const issues = (err as { issues?: string[] }).issues ?? [];
    console.log(`B. Sin domicilio/profesión -> envío BLOQUEADO. Falta: ${issues.join(", ")}`);
  }

  console.log("\nBitácora LGPD (sin PII) de la ficha A:");
  for (const e of await store.events.listForFicha(ficha.id)) {
    console.log(`  - ${e.tipo} ${JSON.stringify(e.payload)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
