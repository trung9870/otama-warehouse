import { Product } from './types';

export const WORKSHOPS = ["A Triều", "Bích", "Thảo"];
export const TYPES = ["Bo chun", "Ôm", "Chăn trần", "Ga trần"];
export const DESTINATIONS = ["Về A", "A Triều", "Bích", "Thảo"];

export const STAFF_LIST = ["Hùng", "Minh", "Tuấn"];

const now = new Date();
export const REAL_TODAY = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

export const formatDate = (iso: string) => {
  if (!iso || !iso.includes("-")) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export const compactDate = (iso: string) => iso.replace(/-/g, "");

export const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  const ny = date.getFullYear();
  const nm = String(date.getMonth() + 1).padStart(2, '0');
  const nd = String(date.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
};
