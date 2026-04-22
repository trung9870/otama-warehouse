export interface Product {
  sku: string;
  name: string;
  category: string;
}

export interface SendOperation {
  id: number;
  batch: number;
  source: 'A' | 'B';
  workshop: string;
  time: string;
  items: Record<string, number>;
  delivered: boolean;
  actualItems?: Record<string, number>;
  deliveryNote?: string;
  deliveredBy?: string;
  deliveredAt?: string;
  bSourceItems?: { sku: string; name: string; qty: number }[];
  sourceBatch?: number;
  workshopIdx?: number;
  isHome?: boolean;
}

export interface ReceiveOperation {
  id: number;
  time: string;
  by: string;
  items: Record<string, number>;
  errors: Record<string, number>;
  forSendId: number;
  receivedOnDate?: string;
}

export interface TicketA {
  id: string;
  date: string;
  isoDate: string;
  creator: string;
  status: string;
  sends: SendOperation[];
  receives: Record<string, ReceiveOperation[]>;
}

export interface DeliveryInfo {
  delivered: boolean;
  deliveredAt?: string;
  deliveredBy?: string;
  sendRefId?: number | null;
}

export interface TicketBItem {
  sku: string;
  batch: number;
  name: string;
  category?: string;
  location?: string;
  requested: number;
  allocation: number[];
  realAllocation: number[] | null;
  actual: number | null;
  photoTaken: boolean;
  photoUrl?: string;
  note: string;
  deliveries: Record<string, DeliveryInfo>;
}

export interface TicketB {
  id: string;
  date: string;
  isoDate: string;
  creator: string;
  status: string;
  items: TicketBItem[];
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: 'admin' | 'manager' | 'staff';
}

export interface AppState {
  currentDate: string;
  ticketsA: Record<string, TicketA>;
  ticketsB: Record<string, TicketB>;
  products: Product[];
}
