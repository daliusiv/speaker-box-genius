/** Air properties used by the acoustic model. */
export interface Air {
  /** Density (kg/m³) */
  rho: number;
  /** Speed of sound (m/s) */
  c: number;
}

/** Dry air at 20 °C, sea level. */
export const STANDARD_AIR: Air = { rho: 1.204, c: 343.2 };

/** The values WinISD writes into its files (and uses by default). */
export const WINISD_AIR: Air = { rho: 1.20095217714682, c: 343.684120962152 };

/** Air density at 20 °C, sea level (kg/m³). */
export const RHO = STANDARD_AIR.rho;
/** Speed of sound at 20 °C (m/s). */
export const C = STANDARD_AIR.c;
