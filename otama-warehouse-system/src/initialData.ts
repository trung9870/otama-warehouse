import React from 'react';
import { TicketA, TicketB } from './types';
import { formatDate, compactDate } from './constants';

export const emptyTicketA = (date: string): TicketA => ({
  id: `GC-A-${compactDate(date)}`,
  date: formatDate(date),
  isoDate: date,
  creator: "Quản lý Lan",
  status: "Mới tạo",
  sends: [],
  receives: { "A Triều": [], "Bích": [], "Thảo": [] },
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
  currentDate: "2026-04-07",
  products: [],
  ticketsA: {
    "2026-04-05": {
      id: "GC-A-20260405", date: "05/04/2026", isoDate: "2026-04-05", creator: "Quản lý Lan", status: "Hoàn tất",
      sends: [
        { id: 1, batch: 1, source: "A", workshop: "A Triều", time: "08:30", items: { "Bo chun": 40, "Ôm": 15 }, delivered: true, actualItems: { "Bo chun": 40, "Ôm": 15 }, deliveredAt: "08:35", deliveredBy: "Hùng" },
        { id: 2, batch: 1, source: "A", workshop: "Bích", time: "08:30", items: { "Bo chun": 25, "Chăn trần": 10 }, delivered: true, actualItems: { "Bo chun": 25, "Chăn trần": 10 }, deliveredAt: "08:35", deliveredBy: "Hùng" },
        { id: 3, batch: 1, source: "A", workshop: "Thảo", time: "08:30", items: { "Bo chun": 30 }, delivered: true, actualItems: { "Bo chun": 30 }, deliveredAt: "08:35", deliveredBy: "Hùng" },
      ],
      receives: {
        "A Triều": [{ id: 1, time: "16:00", by: "Hùng", items: { "Bo chun": 40, "Ôm": 15 }, errors: {}, forSendId: 1 }],
        "Bích": [{ id: 1, time: "16:30", by: "Hùng", items: { "Bo chun": 25, "Chăn trần": 10 }, errors: {}, forSendId: 2 }],
        "Thảo": [{ id: 1, time: "17:00", by: "Hùng", items: { "Bo chun": 30 }, errors: {}, forSendId: 3 }],
      },
    } as TicketA,
    "2026-04-06": {
      id: "GC-A-20260406", date: "06/04/2026", isoDate: "2026-04-06", creator: "Quản lý Lan", status: "Đang GC",
      sends: [
        { id: 1, batch: 1, source: "A", workshop: "A Triều", time: "09:00", items: { "Bo chun": 50, "Ôm": 20 }, delivered: true, actualItems: { "Bo chun": 50, "Ôm": 20 }, deliveredAt: "09:05", deliveredBy: "Hùng" },
        { id: 2, batch: 1, source: "A", workshop: "Bích", time: "09:00", items: { "Bo chun": 35 }, delivered: true, actualItems: { "Bo chun": 35 }, deliveredAt: "09:05", deliveredBy: "Hùng" },
        { id: 3, batch: 1, source: "A", workshop: "Thảo", time: "09:00", items: { "Bo chun": 25, "Chăn trần": 10 }, delivered: true, actualItems: { "Bo chun": 25, "Chăn trần": 10 }, deliveredAt: "09:05", deliveredBy: "Hùng" },
      ],
      receives: {
        "A Triều": [{ id: 1, time: "15:30", by: "Hùng", items: { "Bo chun": 50, "Ôm": 20 }, errors: {}, forSendId: 1 }],
        "Bích": [],
        "Thảo": [],
      },
    } as TicketA,
    "2026-04-07": emptyTicketA("2026-04-07"),
  },
  ticketsB: {
    "2026-04-05": {
      id: "LH-20260405-01", date: "05/04/2026", isoDate: "2026-04-05", creator: "Quản lý Lan", status: "Hoàn tất",
      items: [
        { sku: "GA-005", batch: 1, name: "Mèo lười", location: "Kệ 7, T3", requested: 20, allocation: [10, 10, 0, 0], realAllocation: [10, 10, 0, 0], actual: 20, photoTaken: true, note: "",
          deliveries: { "Về A": { delivered: true, deliveredAt: "10:00" }, "A Triều": { delivered: true, sendRefId: 0, deliveredAt: "10:00" } } },
      ],
    } as TicketB,
    "2026-04-06": {
      id: "LH-20260406-01", date: "06/04/2026", isoDate: "2026-04-06", creator: "Quản lý Lan", status: "Hoàn tất",
      items: [
        { sku: "GA-003", batch: 1, name: "Hoa tulip", location: "Kệ 12, T3", requested: 15, allocation: [5, 5, 5, 0], realAllocation: [5, 5, 5, 0], actual: 15, photoTaken: true, note: "",
          deliveries: { "Về A": { delivered: true, deliveredAt: "11:00" }, "A Triều": { delivered: true, sendRefId: 0, deliveredAt: "11:00" }, "Bích": { delivered: true, sendRefId: 0, deliveredAt: "11:00" } } },
      ],
    } as TicketB,
    "2026-04-07": emptyTicketB("2026-04-07"),
  },
};
