import { MedioTransporte, MotivoViaje } from "../../shared/enums.js";
import type { CatalogDomain, CatalogOption, CatalogPort } from "./port.js";

/**
 * In-memory catalog for tests, the demo and the mockup. The `code` is our
 * canonical value (the enum); the real adapter would carry the actual SNRHos
 * numeric codes and refresh them from the government catalog periodically.
 *
 * `synonyms` powers `resolve()` so loose PMS/agency text ("vacation", "férias",
 * "a pasear") still lands on the right code instead of a 4xx rejection.
 */
interface CatalogEntry {
  code: string;
  label: string;
  synonyms: string[];
}

const CATALOGS: Record<CatalogDomain, CatalogEntry[]> = {
  MOTIVO_VIAJE: [
    {
      code: MotivoViaje.TURISMO,
      label: "Turismo",
      synonyms: ["turismo", "vacaciones", "vacacion", "ferias", "férias", "vacation", "holiday", "ocio", "placer"],
    },
    {
      code: MotivoViaje.NEGOCIOS,
      label: "Negocios",
      synonyms: ["negocios", "trabajo", "business", "corporativo", "negócios"],
    },
    {
      code: MotivoViaje.EVENTOS,
      label: "Eventos",
      synonyms: ["eventos", "evento", "congreso", "convencion", "convención", "feria", "event"],
    },
    {
      code: MotivoViaje.SALUD,
      label: "Salud",
      synonyms: ["salud", "medico", "médico", "tratamiento", "health", "saúde"],
    },
    { code: MotivoViaje.OTROS, label: "Otros", synonyms: ["otros", "otro", "other"] },
  ],
  MEDIO_TRANSPORTE: [
    {
      code: MedioTransporte.AVION,
      label: "Avión",
      synonyms: ["avion", "avión", "aereo", "aéreo", "plane", "flight", "vuelo", "aviao", "avião"],
    },
    {
      code: MedioTransporte.AUTOMOVIL,
      label: "Automóvil",
      synonyms: ["auto", "automovil", "automóvil", "coche", "carro", "car", "vehiculo", "vehículo"],
    },
    {
      code: MedioTransporte.AUTOBUS,
      label: "Autobús",
      synonyms: ["autobus", "autobús", "bus", "omnibus", "ómnibus", "colectivo", "ônibus"],
    },
    {
      code: MedioTransporte.BARCO,
      label: "Barco",
      synonyms: ["barco", "ship", "crucero", "ferry", "navio", "navío"],
    },
    { code: MedioTransporte.OTRO, label: "Otro", synonyms: ["otro", "other"] },
  ],
};

/** Strip accents and lowercase, so "Avião" matches "avion". */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export class FakeCatalog implements CatalogPort {
  async options(domain: CatalogDomain): Promise<CatalogOption[]> {
    return CATALOGS[domain].map(({ code, label }) => ({ code, label }));
  }

  async resolve(domain: CatalogDomain, freeText: string): Promise<string | null> {
    const needle = normalize(freeText);
    if (!needle) return null;
    for (const entry of CATALOGS[domain]) {
      if (normalize(entry.label) === needle) return entry.code;
      if (entry.synonyms.some((s) => normalize(s) === needle)) return entry.code;
    }
    return null;
  }
}
