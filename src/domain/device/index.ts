import { DeviceStatus, DeviceType } from "../../shared/enums.js";

/** An RTU gate controller associated with a condominium. */
export interface Device {
  id: string;
  condominio_id: string;
  tipo: DeviceType;
  /** SIM phone number the device listens on (E.164). */
  numero_sim: string;
  estado: DeviceStatus;
  /**
   * Command password configured on the device. Stored in plaintext because the
   * RTU5024 SMS protocol requires sending it in commands. This is a device
   * configuration secret (not user credentials); protect it at the DB layer.
   */
  password: string;
  created_at: string;
}

export type NewDevice = Pick<
  Device,
  "condominio_id" | "tipo" | "numero_sim"
> &
  Partial<Pick<Device, "estado" | "password">>;
