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

/** Ratio of specific heats of air (adiabatic). The models' ρc² is γ·P₀, so P₀ = ρc²/γ. */
export const AIR_GAMMA = 1.4;

/** Air's coefficient of nonlinearity, β = (γ + 1)/2: how fast a strong wave steepens as it travels. */
export const AIR_BETA = (AIR_GAMMA + 1) / 2;

/** Air density at 20 °C, sea level (kg/m³). */
export const RHO = STANDARD_AIR.rho;
/** Speed of sound at 20 °C (m/s). */
export const C = STANDARD_AIR.c;

/** The air a speaker plays into: temperature (°C), relative humidity (%) and pressure (hPa). */
export interface AirConditions {
  temp_C: number;
  humidity_pct: number;
  pressure_hPa: number;
}

/** Sea level, 20 °C, dry: the standard air above. */
export const SEA_LEVEL_HPA = 1013.25;

/**
 * Density and speed of sound of moist air. Density from the partial pressures of dry air and
 * water vapour (ideal gases), the vapour pressure from Buck's formula for saturation; speed of
 * sound √(γRT/M) for the mixture's molar mass and heat capacities (air diatomic, vapour 4/3).
 * At 20 °C, dry and 1013.25 hPa this is the standard air (1.204 kg/m³, 343.2 m/s); humidity
 * makes air lighter and sound slightly faster, cold and high pressure make it denser.
 */
export function airAt(a: AirConditions): Air {
  const t = a.temp_C;
  const T = t + 273.15;
  const p = a.pressure_hPa * 100;
  const pSat = 611.21 * Math.exp((18.678 - t / 234.5) * (t / (257.14 + t)));
  const pv = Math.min(p, (Math.min(100, Math.max(0, a.humidity_pct)) / 100) * pSat);
  const rho = (p - pv) / (287.058 * T) + pv / (461.495 * T);
  const x = pv / p; // mole fraction of water vapour
  const M = 0.0289652 * (1 - x) + 0.018015 * x;
  const gamma = (3.5 * (1 - x) + 4 * x) / (2.5 * (1 - x) + 3 * x);
  return { rho, c: Math.sqrt((gamma * 8.314462 * T) / M) };
}
