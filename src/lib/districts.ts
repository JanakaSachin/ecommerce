export const DISTRICTS = {
  Colombo: "WP", Gampaha: "WP", Kalutara: "WP",
  Kandy: "CP", Matale: "CP", "Nuwara Eliya": "CP",
  Galle: "SP", Matara: "SP", Hambantota: "SP",
  Jaffna: "NP", Kilinochchi: "NP", Mannar: "NP", Vavuniya: "NP", Mullaitivu: "NP",
  Batticaloa: "EP", Ampara: "EP", Trincomalee: "EP",
  Kurunegala: "NWP", Puttalam: "NWP",
  Anuradhapura: "NCP", Polonnaruwa: "NCP",
  Badulla: "UVA", Monaragala: "UVA",
  Ratnapura: "SAB", Kegalle: "SAB",
} as const;

export type District = keyof typeof DISTRICTS;
export const DISTRICT_NAMES = Object.keys(DISTRICTS) as District[];
export const isDistrict = (v: string): v is District => Object.hasOwn(DISTRICTS, v);
