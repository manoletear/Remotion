import ExcelJS from "exceljs";
import type { Ficha } from "../domain/ficha/index.js";

/**
 * Interim Excel export.
 *
 * Until the real SNRHos HTTP client and Gov.br connector are live, the hotel
 * still needs all captured FNRH data in one place — to back it up, audit it, or
 * upload it manually. This flattens every ficha into one spreadsheet row.
 *
 * ⚠️ LGPD: the resulting file contains full guest PII (name, document, address).
 * It must be stored encrypted and access-restricted — unlike the audit trail,
 * which deliberately holds no PII.
 */

/** One spreadsheet column: header + how to read it off a ficha. */
interface Column {
  header: string;
  get: (f: Ficha) => string;
}

const yesNo = (v: boolean): string => (v ? "Sí" : "No");
const orEmpty = (v: string | null | undefined): string => v ?? "";

const COLUMNS: readonly Column[] = [
  { header: "Localizador reserva", get: (f) => f.reservaLocalizador },
  { header: "Estado", get: (f) => f.estado },
  { header: "Protocolo SNRHos", get: (f) => orEmpty(f.protocoloSnrhos) },
  { header: "Nombre completo", get: (f) => orEmpty(f.hospede?.pessoa.nombreCompleto) },
  { header: "CPF", get: (f) => orEmpty(f.hospede?.pessoa.cpf) },
  { header: "Tipo documento", get: (f) => orEmpty(f.hospede?.pessoa.documento.tipo) },
  { header: "N.º documento", get: (f) => orEmpty(f.hospede?.pessoa.documento.numero) },
  { header: "País emisión", get: (f) => orEmpty(f.hospede?.pessoa.documento.paisEmision) },
  { header: "Vencimiento doc.", get: (f) => orEmpty(f.hospede?.pessoa.documento.fechaVencimiento) },
  { header: "Nacionalidad", get: (f) => orEmpty(f.hospede?.pessoa.nacionalidad) },
  { header: "Fecha nacimiento", get: (f) => orEmpty(f.hospede?.pessoa.fechaNacimiento) },
  { header: "Sexo", get: (f) => orEmpty(f.hospede?.pessoa.sexo) },
  { header: "Profesión", get: (f) => orEmpty(f.hospede?.pessoa.profesion) },
  { header: "Domicilio país", get: (f) => orEmpty(f.hospede?.pessoa.domicilio?.pais) },
  { header: "Domicilio estado", get: (f) => orEmpty(f.hospede?.pessoa.domicilio?.estado) },
  { header: "Domicilio municipio", get: (f) => orEmpty(f.hospede?.pessoa.domicilio?.municipio) },
  { header: "Domicilio dirección", get: (f) => orEmpty(f.hospede?.pessoa.domicilio?.logradouro) },
  { header: "CEP", get: (f) => orEmpty(f.hospede?.pessoa.domicilio?.cep) },
  { header: "Email", get: (f) => orEmpty(f.hospede?.pessoa.email) },
  { header: "Teléfono", get: (f) => orEmpty(f.hospede?.pessoa.telefono) },
  { header: "Motivo viaje", get: (f) => orEmpty(f.hospede?.estadisticos.motivoViaje) },
  { header: "Medio transporte", get: (f) => orEmpty(f.hospede?.estadisticos.medioTransporte) },
  { header: "Punto origen", get: (f) => orEmpty(f.hospede?.estadisticos.puntoOrigen) },
  { header: "Próximo destino", get: (f) => orEmpty(f.hospede?.estadisticos.proximoDestino) },
  { header: "Dependientes", get: (f) => String(f.hospede?.dependientes.length ?? 0) },
  { header: "Gov.br verificado", get: (f) => yesNo(f.hospede?.pessoa.identidadVerificadaGovBr ?? false) },
  { header: "Check-in", get: (f) => orEmpty(f.checkinAt) },
  { header: "Check-out", get: (f) => orEmpty(f.checkoutAt) },
];

/** Build a plain matrix (header row + one row per ficha) — pure, testable. */
export function buildFichaRows(fichas: readonly Ficha[]): string[][] {
  const header = COLUMNS.map((c) => c.header);
  const rows = fichas.map((f) => COLUMNS.map((c) => c.get(f)));
  return [header, ...rows];
}

/** Write all fichas to a real .xlsx workbook at `filePath`. */
export async function writeFichasXlsx(
  fichas: readonly Ficha[],
  filePath: string,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Túnel FNRH";
  const sheet = workbook.addWorksheet("FNRH", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const [header, ...dataRows] = buildFichaRows(fichas);
  sheet.addRow(header);
  sheet.getRow(1).font = { bold: true };
  for (const row of dataRows) sheet.addRow(row);

  // Reasonable default widths so the sheet is readable on open.
  sheet.columns.forEach((col) => {
    col.width = 20;
  });

  await workbook.xlsx.writeFile(filePath);
}
