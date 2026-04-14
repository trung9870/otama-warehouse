import { Product } from './types';

export const WORKSHOPS = ["A Triều", "Bích", "Thảo"];
export const TYPES = ["Bo chun", "Ôm", "Chăn trần", "Ga trần"];
export const DESTINATIONS = ["Về A", "A Triều", "Bích", "Thảo"];

export const STAFF_LIST = ["Hùng", "Minh", "Tuấn"];

export const REAL_TODAY = "2026-04-07";

export const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export const compactDate = (iso: string) => iso.replace(/-/g, "");

export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
};
