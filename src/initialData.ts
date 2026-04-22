import React from 'react';
import { TicketA, TicketB } from './types';
import { formatDate, compactDate, REAL_TODAY } from './constants';

export const emptyTicketA = (date: string): TicketA => ({
  id: `GC-A-${compactDate(date)}`,
  date: formatDate(date),
  isoDate: date,
  creator: "Quản lý Lan",
  status: "Mới tạo",
  sends: [],
  receives: { "Về A": [], "A Triều": [], "Bích": [], "Thảo": [] },
});

export const emptyTicketB = (date: string): TicketB => ({
  id: `LH-${compactDate(date)}-01`,
  date: formatDate(date),
  isoDate: date,
  creator: "Quản lý Lan",
  status: "Chờ thực hiện",
  items: [],
});

export const initialData = {
  currentDate: REAL_TODAY,
  products: [],
  ticketsA: {
    [REAL_TODAY]: emptyTicketA(REAL_TODAY),
  },
  ticketsB: {
    [REAL_TODAY]: emptyTicketB(REAL_TODAY),
  },
};
