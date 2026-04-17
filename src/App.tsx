import React, { useState, useEffect } from 'react';
import { 
  X,
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Check, 
  Undo2, 
  Camera, 
  Edit2,
  Edit3, 
  Trash2, 
  AlertCircle,
  LayoutDashboard,
  Package,
  Users,
  Search,
  ChevronDown,
  Clock,
  LogOut,
  Moon,
  Sun,
  Eye,
  EyeOff,
  ListChecks
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  getAuth
} from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  query, 
  where,
  getDoc,
  getDocs,
  writeBatch,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { db, auth, messaging, firebaseConfig } from './firebase';
import { cn } from './lib/utils';
import { Modal } from './components/Modal';
import { 
  WORKSHOPS, 
  TYPES, 
  REAL_TODAY, 
  formatDate, 
  addDays 
} from './constants';
import { 
  TicketA, 
  TicketB, 
  AppState, 
  Product,
  SendOperation, 
  ReceiveOperation, 
  TicketBItem,
  UserProfile
} from './types';
import { initialData, emptyTicketA, emptyTicketB } from './initialData';

export default function App() {
  const [state, setState] = useState<AppState>(initialData);
  const [tab, setTab] = useState<'A' | 'BM' | 'BS' | 'PROD' | 'USERS' | 'SETTINGS'>('A');
  const [toast, setToast] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    workshops: WORKSHOPS,
    types: TYPES
  });
  const [modal, setModal] = useState<any>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('otama-dark-mode');
      return saved === 'true';
    }
    return false;
  });
  
  // Login states
  const [loginMode, setLoginMode] = useState<'admin' | 'staff'>('staff');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Create staff states
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [showReceivedProgress, setShowReceivedProgress] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [historySend, setHistorySend] = useState<SendOperation | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  // Derived data
  const isAdmin = user?.email === 'trungg9870@gmail.com' || userProfile?.role === 'admin';
  const isManager = isAdmin || userProfile?.role === 'manager';
  const isStaff = isManager || userProfile?.role === 'staff';
  const destinations = ["Về A", ...settings.workshops];
  
  // Notification Setup
  const requestNotificationPermission = async () => {
    if (!messaging || !user) return;
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        // Note: You need a VAPID key from Firebase Console
        // Settings -> Cloud Messaging -> Web Configuration
        const VAPID_KEY = "BN9EVEaV4o4ybQU7ryFXAv1fM1EJQ6qOJfR9AnYumxopAreO9bbDkgWXJACIoxsjyKqV40LfVSj7VTve5Sq9sYI";
        if (!VAPID_KEY) {
          showToast("Vui lòng cấu hình VAPID Key trong code để nhận thông báo");
          return;
        }

        const token = await getToken(messaging, { vapidKey: VAPID_KEY });
        if (token) {
          await setDoc(doc(db, 'users', user.uid), {
            fcmTokens: arrayUnion(token)
          }, { merge: true });
          showToast("Đã đăng ký nhận thông báo!");
        }
      }
    } catch (err) {
      console.error("Error requesting permission:", err);
      showToast("Lỗi khi đăng ký thông báo");
    }
  };

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setNotificationPermission(Notification.permission);
    }
    
    if (messaging) {
      const unsub = onMessage(messaging, (payload) => {
        console.log("Foreground message:", payload);
        if (payload.notification) {
          showToast(`TB: ${payload.notification.title}`);
        }
      });
      return () => unsub();
    }
  }, [user]);

  // Helper to aggregate items by category
  const aggregateByCategory = (items: { name: string, qty: number, sku?: string }[]) => {
    const result: Record<string, number> = {};
    items.forEach(i => {
      const product = state.products.find(p => p.sku === i.sku || p.name === i.name);
      let type = product?.category || "Bo chun";
      // Ensure the type exists in our summary table categories (e.g. map "Vỏ chăn" to "Bo chun")
      if (!settings.types.includes(type)) {
        type = "Bo chun";
      }
      result[type] = (result[type] || 0) + i.qty;
    });
    return result;
  };

  // Auto-repair workshopIdx for old data
  useEffect(() => {
    if (!state.ticketsA || Object.keys(state.ticketsA).length === 0) return;
    
    let globalChanged = false;
    const nextTicketsA = { ...state.ticketsA };
    
    Object.keys(nextTicketsA).forEach(date => {
      const ticket = nextTicketsA[date];
      let ticketChanged = false;
      const nextSends = ticket.sends.map(s => {
        let changed = false;
        let newS = { ...s };
        
        if (s.workshopIdx === undefined) {
          const dIdx = destinations.indexOf(s.workshop);
          if (dIdx !== -1) {
            newS.workshopIdx = dIdx;
            changed = true;
          }
        }

        // Repair item categories (e.g. map "Vỏ chăn" to "Bo chun")
        const repairItems = (items: Record<string, number>) => {
          const newItems: Record<string, number> = {};
          let itemsChanged = false;
          Object.entries(items).forEach(([k, v]) => {
            if (!settings.types.includes(k)) {
              newItems["Bo chun"] = (newItems["Bo chun"] || 0) + v;
              itemsChanged = true;
            } else {
              newItems[k] = (newItems[k] || 0) + v;
            }
          });
          return { newItems, itemsChanged };
        };

        const { newItems, itemsChanged } = repairItems(s.items);
        if (itemsChanged) {
          newS.items = newItems;
          changed = true;
        }
        
        if (s.actualItems) {
          const { newItems: newActual, itemsChanged: actualChanged } = repairItems(s.actualItems);
          if (actualChanged) {
            newS.actualItems = newActual;
            changed = true;
          }
        }

        if (changed) {
          ticketChanged = true;
          globalChanged = true;
          return newS;
        }
        return s;
      });
      if (ticketChanged) {
        nextTicketsA[date] = { ...ticket, sends: nextSends };
      }
    });
    
    if (globalChanged) {
      setState(prev => ({ ...prev, ticketsA: nextTicketsA }));
    }
  }, [settings.workshops, state.products.length]);

  // --- Error Handling ---
  enum OperationType {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    LIST = 'list',
    GET = 'get',
    WRITE = 'write',
  }

  interface FirestoreErrorInfo {
    error: string;
    operationType: OperationType;
    path: string | null;
    authInfo: {
      userId: string | undefined;
      email: string | null | undefined;
      emailVerified: boolean | undefined;
      isAnonymous: boolean | undefined;
      tenantId: string | null | undefined;
      providerInfo: {
        providerId: string;
        displayName: string | null;
        email: string | null;
        photoUrl: string | null;
      }[];
    }
  }

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    
    if (errInfo.error.toLowerCase().includes("permission")) {
      showToast("Bạn không có quyền thực hiện hành động này!");
    } else {
      showToast("Lỗi hệ thống!");
    }
    
    throw new Error(JSON.stringify(errInfo));
  };

  // --- Firebase Sync ---
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let unsubProducts: (() => void) | null = null;
    let unsubTicketsA: (() => void) | null = null;
    let unsubTicketsB: (() => void) | null = null;
    let unsubSettings: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      
      // Clean up existing listeners
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }
      if (unsubProducts) { unsubProducts(); unsubProducts = null; }
      if (unsubTicketsA) { unsubTicketsA(); unsubTicketsA = null; }
      if (unsubTicketsB) { unsubTicketsB(); unsubTicketsB = null; }
      if (unsubSettings) { unsubSettings(); unsubSettings = null; }

      if (u) {
        // Check if profile exists, if not create as staff
        const userRef = doc(db, 'users', u.uid);
        try {
          const userSnap = await getDoc(userRef);
          
          if (!userSnap.exists()) {
            const newProfile: UserProfile = {
              uid: u.uid,
              email: u.email || '',
              displayName: u.displayName || '',
              photoURL: u.photoURL || '',
              role: u.email === 'trungg9870@gmail.com' ? 'admin' : 'staff'
            };
            await setDoc(userRef, newProfile);
          }

          // Listen to own profile
          unsubProfile = onSnapshot(userRef, (snap) => {
            if (snap.exists()) {
              setUserProfile(snap.data() as UserProfile);
            }
          }, (err) => {
            handleFirestoreError(err, OperationType.GET, `users/${u.uid}`);
          });

          // Sync Products
          unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
            const prods = snap.docs.map(d => d.data() as Product);
            setState(prev => ({ ...prev, products: prods }));
          }, (err) => {
            handleFirestoreError(err, OperationType.LIST, 'products');
          });

          // Sync Tickets A
          unsubTicketsA = onSnapshot(collection(db, 'ticketsA'), (snap) => {
            const tickets: Record<string, TicketA> = {};
            snap.docs.forEach(d => { tickets[d.id] = d.data() as TicketA; });
            setState(prev => ({ ...prev, ticketsA: { ...prev.ticketsA, ...tickets } }));
          }, (err) => {
            handleFirestoreError(err, OperationType.LIST, 'ticketsA');
          });

          // Sync Tickets B
          unsubTicketsB = onSnapshot(collection(db, 'ticketsB'), (snap) => {
            const tickets: Record<string, TicketB> = {};
            snap.docs.forEach(d => { tickets[d.id] = d.data() as TicketB; });
            setState(prev => ({ ...prev, ticketsB: { ...prev.ticketsB, ...tickets } }));
          }, (err) => {
            handleFirestoreError(err, OperationType.LIST, 'ticketsB');
          });

          // Sync Settings
          unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
            if (snap.exists()) {
              setSettings(snap.data() as any);
            } else {
              // Initialize settings if not exists (only if admin)
              if (u.email === 'trungg9870@gmail.com') {
                setDoc(doc(db, 'settings', 'global'), {
                  workshops: WORKSHOPS,
                  types: TYPES
                }).catch(err => handleFirestoreError(err, OperationType.WRITE, 'settings/global'));
              }
            }
          }, (err) => {
            handleFirestoreError(err, OperationType.GET, 'settings/global');
          });

        } catch (err) {
          console.error("Error initializing user data:", err);
        }
      } else {
        setUserProfile(null);
      }
      setIsAuthReady(true);
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
      if (unsubProducts) unsubProducts();
      if (unsubTicketsA) unsubTicketsA();
      if (unsubTicketsB) unsubTicketsB();
      if (unsubSettings) unsubSettings();
    };
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('otama-dark-mode', isDarkMode.toString());
  }, [isDarkMode]);

  // Sync All Users for Admin
  useEffect(() => {
    if (isAdmin) {
      const unsub = onSnapshot(collection(db, 'users'), (snap) => {
        const users = snap.docs.map(d => d.data() as UserProfile);
        setAllUsers(users);
      }, (err) => {
        console.error("Users sync error:", err);
      });
      return () => unsub();
    } else {
      setAllUsers([]);
    }
  }, [isAdmin]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      showToast("Đã đăng nhập!");
    } catch (err) {
      console.error("Login error:", err);
      showToast("Lỗi đăng nhập!");
    }
  };

  const staffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setIsLoggingIn(true);
    try {
      // Internal dummy domain
      const email = `${username}@otama.local`;
      await signInWithEmailAndPassword(auth, email, password);
      showToast("Đăng nhập thành công!");
    } catch (err: any) {
      console.error("Staff login error:", err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        showToast("Sai tên đăng nhập hoặc mật khẩu!");
      } else {
        showToast("Lỗi đăng nhập!");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const createStaffAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffUsername || !newStaffPassword || !newStaffName) return;
    if (!isAdmin) {
      showToast("Bạn không có quyền thực hiện hành động này!");
      return;
    }

    setIsCreatingStaff(true);
    try {
      // Use a secondary Firebase app to create the user without signing out the admin
      const secondaryApp = initializeApp(firebaseConfig, `Secondary-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);

      // Create user with dummy email
      const email = `${newStaffUsername}@otama.local`;
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, newStaffPassword);
      const newUid = userCredential.user.uid;

      // Create profile in Firestore
      const userRef = doc(db, 'users', newUid);
      await setDoc(userRef, {
        uid: newUid,
        email: email,
        displayName: newStaffName,
        role: 'staff',
        createdAt: new Date().toISOString(),
        status: 'active'
      });

      showToast(`Đã tạo tài khoản cho ${newStaffName}`);
      setNewStaffUsername('');
      setNewStaffPassword('');
      setNewStaffName('');
      
      // Clean up secondary app
      // Note: In some Firebase versions, there's no easy deleteApp, but it's fine for this use case
    } catch (err: any) {
      console.error("Create staff error:", err);
      let errorMsg = "Lỗi tạo tài khoản! Vui lòng kiểm tra lại.";
      
      if (err.code === 'auth/email-already-in-use') {
        errorMsg = "Tên đăng nhập này đã tồn tại!";
      } else if (err.code === 'auth/weak-password') {
        errorMsg = "Mật khẩu quá yếu (tối thiểu 6 ký tự)!";
      } else if (err.code === 'auth/operation-not-allowed') {
        errorMsg = "Tính năng đăng nhập bằng Mật khẩu chưa được bật trong Firebase Console. Vui lòng liên hệ hỗ trợ.";
      } else if (err.message) {
        errorMsg = `Lỗi: ${err.message}`;
      }
      
      showToast(errorMsg);
    } finally {
      setIsCreatingStaff(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      showToast("Đã đăng xuất!");
    } catch (err) {
      showToast("Lỗi đăng xuất!");
    }
  };

  const toggleUserRole = async (u: UserProfile) => {
    if (!isAdmin) return;
    const newRole = u.role === 'manager' ? 'staff' : 'manager';
    try {
      await setDoc(doc(db, 'users', u.uid), { ...u, role: newRole });
      showToast(`Đã đổi quyền ${u.displayName} thành ${newRole === 'manager' ? 'Quản lý' : 'Nhân viên'}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${u.uid}`);
    }
  };

  // Derived data
  const currentDate = state.currentDate;
  const ticketA = state.ticketsA[currentDate] || emptyTicketA(currentDate);
  const ticketB = state.ticketsB[currentDate] || emptyTicketB(currentDate);

  // Helper to update state and persist to Firestore
  const updateData = async (updater: (prev: AppState) => Partial<AppState>) => {
    // Use functional update to ensure we have the latest state
    setState(prev => {
      const nextPartial = updater(prev);
      const nextState = { ...prev, ...nextPartial };

      // Persist changes to Firestore in the background
      (async () => {
        try {
          if (nextPartial.ticketsA) {
            for (const date in nextPartial.ticketsA) {
              await setDoc(doc(db, 'ticketsA', date), nextPartial.ticketsA[date]);
            }
          }
          if (nextPartial.ticketsB) {
            for (const date in nextPartial.ticketsB) {
              await setDoc(doc(db, 'ticketsB', date), nextPartial.ticketsB[date]);
            }
          }
          if (nextPartial.products) {
            // Batch update for products
            const batch = writeBatch(db);
            nextPartial.products.forEach(p => {
              batch.set(doc(db, 'products', p.sku), p);
            });
            await batch.commit();
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'multiple');
        }
      })();

      return nextState;
    });
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // --- Date Navigation ---
  const changeDate = (newDate: string) => {
    setState(prev => {
      const newState = { ...prev, currentDate: newDate };
      if (!prev.ticketsA[newDate]) {
        const tA = emptyTicketA(newDate);
        tA.receives = {};
        settings.workshops.forEach(ws => { tA.receives[ws] = []; });
        newState.ticketsA = { ...prev.ticketsA, [newDate]: tA };
      }
      if (!prev.ticketsB[newDate]) newState.ticketsB = { ...prev.ticketsB, [newDate]: emptyTicketB(newDate) };
      return newState;
    });
  };

  // --- Phiếu A Logic ---
  const [showAddSend, setShowAddSend] = useState(false);
  const [newSendItems, setNewSendItems] = useState<Record<string, number[]>>({});
  const [deliveringSend, setDeliveringSend] = useState<SendOperation | null>(null);
  const [deliveryActual, setDeliveryActual] = useState<Record<string, number>>({});
  const [deliveryNote, setDeliveryNote] = useState("");

  const [receivingPartialSend, setReceivingPartialSend] = useState<SendOperation | null>(null);
  const [partialReceiveItems, setPartialReceiveItems] = useState<Record<string, string>>({});
  const [partialReceiveErrors, setPartialReceiveErrors] = useState<Record<string, string>>({});

  const submitNewSend = () => {
    const newSends: SendOperation[] = [];
    const time = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    let nextId = Math.max(0, ...ticketA.sends.map(s => s.id)) + 1;
    const nextBatch = Math.max(0, ...ticketA.sends.map(s => s.batch || 1)) + 1;
    let totalAdded = 0;

    settings.workshops.forEach((ws, wsIdx) => {
      const items: Record<string, number> = {};
      settings.types.forEach(t => {
        const v = newSendItems[t]?.[wsIdx] || 0;
        if (v > 0) items[t] = v;
      });
      if (Object.keys(items).length === 0) return;
      newSends.push({ 
        id: nextId++, 
        batch: nextBatch, 
        source: "A", 
        workshop: ws, 
        time, 
        items, 
        delivered: false,
        workshopIdx: wsIdx + 1 // destinations[0] is "Về A"
      });
      Object.values(items).forEach(v => { totalAdded += v; });
    });

    if (newSends.length === 0) return;

    updateData(prev => {
      const currentTicketA = prev.ticketsA[currentDate] || ticketA;
      return {
        ticketsA: {
          ...prev.ticketsA,
          [currentDate]: {
            ...currentTicketA,
            sends: [...currentTicketA.sends, ...newSends]
          }
        }
      };
    });
    setShowAddSend(false);
    setNewSendItems({});
    showToast(`Đã thêm L${nextBatch} — ${totalAdded} chiếc cho ${newSends.length} xưởng`);
  };

  // --- Phiếu B Logic ---
  const [productForm, setProductForm] = useState<{ mode: 'add' | 'edit', batch?: number, sku?: string } | null>(null);
  const [formProductSku, setFormProductSku] = useState("");
  const [formProductAlloc, setFormProductAlloc] = useState<number[]>(new Array(destinations.length).fill(0));
  const [productSearch, setProductSearch] = useState("");
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editingSendWorkshop, setEditingSendWorkshop] = useState<SendOperation | null>(null);
  const [editActual, setEditActual] = useState(0);
  const [editNote, setEditNote] = useState("");
  const [deliveryConfirmItems, setDeliveryConfirmItems] = useState<{sku: string, name: string, qty: number}[]>([]);
  const [deliveryConfirmDest, setDeliveryConfirmDest] = useState<{name: string, idx: number, bNum: number} | null>(null);
  const [reAllocInputs, setReAllocInputs] = useState<Record<string, string[]>>({});
  const [editingRealloc, setEditingRealloc] = useState<Record<string, number[]>>({});
  const [collapsedBatches, setCollapsedBatches] = useState<Record<string, boolean>>({});
  const [collapsedBatchesA, setCollapsedBatchesA] = useState<Record<string, boolean>>({});

  // --- Render Helpers ---
  const getSentTotal = (tA: TicketA, ws: string) => {
    const sends = tA.sends.filter(x => x.workshop === ws && x.delivered);
    const totals: Record<string, number> = {};
    sends.forEach(s => {
      Object.entries(s.actualItems || s.items).forEach(([k, v]) => {
        totals[k] = (totals[k] || 0) + v;
      });
    });
    return totals;
  };

  const getRecvTotals = (tA: TicketA, ws: string) => {
    const rounds = tA.receives[ws] || [];
    const totals: Record<string, number> = {};
    const errors: Record<string, number> = {};
    settings.types.forEach(t => { totals[t] = 0; errors[t] = 0; });
    rounds.forEach(r => {
      Object.entries(r.items).forEach(([k, v]) => { totals[k] = (totals[k] || 0) + (v as number); });
      Object.entries(r.errors || {}).forEach(([k, v]) => { errors[k] = (errors[k] || 0) + (v as number); });
    });
    return { totals, errors };
  };

  const sumValues = (obj: Record<string, number>) => (Object.values(obj) as number[]).reduce((a, b) => a + b, 0);

  const getSendStatus = (send: SendOperation) => {
    const sentItems = send.actualItems || send.items;
    const sentTotal = sumValues(sentItems);
    const receivesForSend = (ticketA.receives[send.workshop] || []).filter(r => r.forSendId === send.id);
    let recvTotal = 0;
    receivesForSend.forEach(r => {
      recvTotal += sumValues(r.items);
      recvTotal += sumValues(r.errors || {});
    });
    if (recvTotal === 0) return { status: "pending", recvTotal, sentTotal };
    if (recvTotal >= sentTotal) return { status: "done", recvTotal, sentTotal };
    return { status: "partial", recvTotal, sentTotal };
  };

  const undoReceive = (send: SendOperation) => {
    const tA = { ...ticketA };
    const wsReceives = tA.receives[send.workshop] || [];
    // Find the last receive for this specific send
    const lastIndex = [...wsReceives].reverse().findIndex(r => r.forSendId === send.id);
    if (lastIndex === -1) {
      showToast("Không có dữ liệu để hoàn tác");
      return;
    }
    
    const actualIndex = wsReceives.length - 1 - lastIndex;
    const newWsReceives = [...wsReceives];
    newWsReceives.splice(actualIndex, 1);
    
    tA.receives = {
      ...tA.receives,
      [send.workshop]: newWsReceives
    };

    setState(prev => ({
      ...prev,
      ticketsA: {
        ...prev.ticketsA,
        [currentDate]: tA
      }
    }));
    showToast("Đã hoàn tác lượt nhận gần nhất");
  };

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-slate-950 min-h-screen shadow-xl flex flex-col relative transition-colors duration-300">
      {/* Login Overlay */}
      <AnimatePresence>
        {!user && isAuthReady && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-gray-900/95 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
                  <Package className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Otama Warehouse</h2>
                <p className="text-sm text-gray-500 mt-1">Hệ thống quản lý kho vận</p>
              </div>

              <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
                <button 
                  onClick={() => setLoginMode('staff')}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                    loginMode === 'staff' ? "bg-white shadow-sm text-blue-600" : "text-gray-500"
                  )}
                >
                  Người dùng
                </button>
                <button 
                  onClick={() => setLoginMode('admin')}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                    loginMode === 'admin' ? "bg-white shadow-sm text-blue-600" : "text-gray-500"
                  )}
                >
                  Admin
                </button>
              </div>

              {loginMode === 'staff' ? (
                <form onSubmit={staffLogin} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Tên đăng nhập</label>
                    <input 
                      type="text" 
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-xl text-sm transition-all outline-none"
                      placeholder="Nhập tên đăng nhập..."
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Mật khẩu</label>
                    <input 
                      type="password" 
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-xl text-sm transition-all outline-none"
                      placeholder="••••••••"
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {isLoggingIn ? "Đang kiểm tra..." : "Đăng nhập Người dùng"}
                  </button>
                </form>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500 text-center leading-relaxed">
                    Chế độ dành riêng cho Admin hệ thống. Vui lòng đăng nhập bằng tài khoản Google đã được cấp quyền.
                  </p>
                  <button 
                    onClick={login}
                    className="w-full py-4 bg-white border-2 border-gray-100 flex items-center justify-center gap-3 font-bold rounded-2xl hover:bg-gray-50 active:scale-[0.98] transition-all"
                  >
                    <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                    Đăng nhập Google (Admin)
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b dark:border-slate-800 px-4 py-3 flex items-center justify-between transition-colors">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-bold text-lg tracking-tight dark:text-white">Otama Warehouse</h1>
        </div>
        <div className="flex items-center gap-3 relative">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition-all"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          
          {user ? (
            <>
              <button 
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-1 pr-3 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
              >
                <img 
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}`} 
                  alt="Avatar" 
                  className="w-6 h-6 rounded-full"
                  referrerPolicy="no-referrer"
                />
                <span className="text-[10px] font-bold text-gray-600 truncate max-w-[60px]">{user.displayName || user.email}</span>
                <ChevronDown className={cn("w-3 h-3 text-gray-400 transition-transform", showUserMenu && "rotate-180")} />
              </button>

              <AnimatePresence>
                {showUserMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowUserMenu(false)}
                    />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border z-50 overflow-hidden"
                    >
                      <div className="p-2">
                        {isAdmin && (
                          <button 
                            onClick={() => {
                              setTab('SETTINGS');
                              setShowUserMenu(false);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-colors"
                          >
                            <LayoutDashboard className="w-4 h-4" />
                            Cấu hình hệ thống
                          </button>
                        )}
                        {isAdmin && (
                          <button 
                            onClick={() => {
                              setTab('USERS');
                              setShowUserMenu(false);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-colors"
                          >
                            <Users className="w-4 h-4" />
                            Quản lý nhân sự
                          </button>
                        )}
                        <button 
                          onClick={() => {
                            logout();
                            setShowUserMenu(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Đăng xuất
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </>
          ) : (
            <button 
              onClick={login}
              className="px-3 py-1.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-lg hover:bg-blue-100 transition-colors"
            >
              Đăng nhập
            </button>
          )}
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hidden sm:block">v2.0.5</div>
        </div>
      </header>

      {/* Date Navigation */}
      <div className={cn(
        "flex items-center justify-between gap-2 px-4 py-2 border-b dark:border-slate-800 transition-colors",
        currentDate === REAL_TODAY ? "bg-blue-50 dark:bg-blue-900/20" : "bg-amber-50 dark:bg-amber-900/20"
      )}>
        <button 
          onClick={() => changeDate(addDays(currentDate, -1))}
          className="p-1.5 rounded-lg border dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:bg-gray-50 dark:hover:bg-slate-700"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
        </button>
        <div className="flex-1 flex items-center justify-center gap-2">
          <Calendar className={cn("w-4 h-4", currentDate === REAL_TODAY ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400")} />
          <input 
            type="date" 
            value={currentDate} 
            onChange={(e) => e.target.value && changeDate(e.target.value)}
            className="bg-transparent font-bold text-sm text-center focus:outline-none dark:text-white"
          />
        </div>
        <button 
          onClick={() => changeDate(addDays(currentDate, 1))}
          className="p-1.5 rounded-lg border dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:bg-gray-50 dark:hover:bg-slate-700"
        >
          <ChevronRight className="w-5 h-5 text-gray-600 dark:text-slate-400" />
        </button>
        {currentDate !== REAL_TODAY && (
          <button 
            onClick={() => changeDate(REAL_TODAY)}
            className="px-3 py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-lg shadow-sm"
          >
            TODAY
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="px-4 py-3">
        <div className="bg-gray-100 dark:bg-slate-800 p-1 rounded-xl flex gap-1">
          <button 
            onClick={() => setTab('A')}
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
              tab === 'A' ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
            )}
          >
            Phiếu A (GC)
          </button>
          {isManager && (
            <button 
              onClick={() => setTab('BM')}
              className={cn(
                "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                tab === 'BM' ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
              )}
            >
              Phiếu B (QL)
            </button>
          )}
          <button 
            onClick={() => setTab('BS')}
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
              tab === 'BS' ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
            )}
          >
            Phiếu B (NV)
          </button>
          {isAdmin && (
            <button 
              onClick={() => setTab('PROD')}
              className={cn(
                "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                tab === 'PROD' ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
              )}
            >
              Sản phẩm
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <main className="flex-1 px-4 pb-24 overflow-y-auto">
        {tab === 'A' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Ticket Info */}
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{ticketA.id}</h2>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Gia công · {ticketA.date} · {ticketA.creator}</p>
              </div>
              <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 text-[10px] font-bold rounded-full">
                {ticketA.status}
              </span>
            </div>

            {/* Allocation Matrix */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="bg-gray-50 dark:bg-slate-800/50 px-4 py-2 border-b dark:border-slate-800 flex justify-between items-center">
                <h3 className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider">Phân chia xưởng</h3>
                <button 
                  onClick={() => setShowReceivedProgress(!showReceivedProgress)}
                  className={cn(
                    "p-1.5 rounded-lg transition-all active:scale-90",
                    showReceivedProgress ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-400 dark:bg-slate-700 dark:text-slate-400"
                  )}
                  title={showReceivedProgress ? "Ẩn số lượng nhận" : "Xem số lượng nhận"}
                >
                  {showReceivedProgress ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50">
                      <th className="text-left p-3 font-semibold text-gray-500 dark:text-slate-400">Loại</th>
                      {destinations.map(d => <th key={d} className="p-3 font-semibold text-gray-500 dark:text-slate-400">{d}</th>)}
                      <th className="p-3 font-bold text-blue-600 dark:text-blue-400">Tổng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-slate-800">
                    {settings.types.map(t => {
                      const rowData = destinations.map((dest, dIdx) => {
                        const sends = ticketA.sends.filter(s => (s.workshopIdx === dIdx || s.workshop === dest) && s.delivered);
                        const sent = sends.reduce((sum: number, s) => sum + ((s.actualItems || s.items)[t] || 0), 0);
                        const received = ticketA.receives[dest]?.reduce((sum: number, r: ReceiveOperation) => sum + (r.items[t] || 0), 0) || 0;
                        return { sent, received };
                      });
                      const totalSent = rowData.reduce((a, b) => a + b.sent, 0);
                      const totalReceived = rowData.reduce((a, b) => a + b.received, 0);
                      
                      return (
                        <tr key={t} className="border-b dark:border-slate-800 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="p-3 font-bold text-gray-700 dark:text-slate-200">{t}</td>
                          {rowData.map((v, i) => (
                            <td key={i} className="p-3 text-center">
                              {!showReceivedProgress ? (
                                <span className="text-gray-600 dark:text-slate-400">{v.sent || 0}</span>
                              ) : (
                                <div className="flex flex-col items-center">
                                  <span className="text-gray-900 dark:text-white font-bold">{v.sent || 0}</span>
                                  <div className="w-full h-[1px] bg-gray-200 dark:bg-slate-700 my-0.5" />
                                  <span className={cn(
                                    "font-bold",
                                    v.received >= v.sent && v.sent > 0 ? "text-green-600 dark:text-green-400" : 
                                    v.received > 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-400"
                                  )}>
                                    {v.received || 0}
                                  </span>
                                </div>
                              )}
                            </td>
                          ))}
                          <td className="p-3 text-center font-bold bg-blue-50/30 dark:bg-blue-900/20">
                            {!showReceivedProgress ? (
                              <span className="text-blue-600 dark:text-blue-400">{totalSent}</span>
                            ) : (
                              <div className="flex flex-col items-center">
                                <span className="text-blue-700 dark:text-blue-300">{totalSent}</span>
                                <div className="w-full h-[1px] bg-blue-200 dark:bg-blue-800 my-0.5" />
                                <span className={cn(
                                  totalReceived >= totalSent && totalSent > 0 ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"
                                )}>
                                  {totalReceived}
                                </span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 dark:bg-slate-800 font-bold border-t-2 border-gray-200 dark:border-slate-700">
                      <td className="p-3 dark:text-white">TỔNG</td>
                      {destinations.map((dest, dIdx) => {
                        const sends = ticketA.sends.filter(s => (s.workshopIdx === dIdx || s.workshop === dest) && s.delivered);
                        const sent = sends.reduce((sum: number, s) => sum + sumValues(s.actualItems || s.items), 0);
                        const received = ticketA.receives[dest]?.reduce((sum: number, r: ReceiveOperation) => sum + sumValues(r.items), 0) || 0;
                        
                        return (
                          <td key={dest} className="p-3 text-center dark:text-white">
                            {!showReceivedProgress ? (
                              sent
                            ) : (
                              <div className="flex flex-col items-center">
                                <span>{sent}</span>
                                <div className="w-full h-[1px] bg-gray-300 dark:bg-slate-600 my-0.5" />
                                <span className={sent > 0 && received >= sent ? "text-green-600 dark:text-green-400" : ""}>{received}</span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-3 text-center bg-blue-100/50 dark:bg-blue-900/40">
                        {(() => {
                          const totalSent = ticketA.sends.filter(s => s.delivered).reduce((sum: number, s) => sum + sumValues(s.actualItems || s.items), 0);
                          const totalReceived = Object.values(ticketA.receives).flat().reduce((sum: number, r: any) => sum + sumValues(r.items), 0);
                          
                          return !showReceivedProgress ? (
                            <span className="text-blue-700 dark:text-blue-300">{totalSent}</span>
                          ) : (
                            <div className="flex flex-col items-center">
                              <span className="text-blue-800 dark:text-blue-200">{totalSent}</span>
                              <div className="w-full h-[1px] bg-blue-300 dark:bg-blue-700 my-0.5" />
                              <span className={totalSent > 0 && totalReceived >= totalSent ? "text-green-700 dark:text-green-300" : "text-blue-700 dark:text-blue-300"}>
                                {totalReceived}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Pending Sends */}
            {ticketA.sends.filter(s => !s.delivered).length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-800">Chờ giao xưởng</h3>
                  <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {ticketA.sends.filter(s => !s.delivered).length} lượt
                  </span>
                </div>
                {ticketA.sends.filter(s => !s.delivered).map(send => (
                  <div key={send.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-amber-900">{send.workshop}</span>
                        <span className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                          send.source === 'B' ? "bg-purple-200 text-purple-800" : "bg-amber-200 text-amber-800"
                        )}>
                          L{send.batch} · {send.source}
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-700 mt-1 truncate">
                        {Object.entries(send.items).map(([k, v]) => `${k} ${v}`).join(", ")}
                      </p>
                    </div>
                    <button 
                      onClick={() => {
                        setDeliveringSend(send);
                        setDeliveryActual({ ...send.items });
                        setDeliveryNote("");
                        setModal({ type: 'delivery' });
                      }}
                      className="bg-amber-600 text-white px-3 py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-amber-700 transition-colors shrink-0"
                    >
                      Giao hàng
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Send Form Toggle */}
            {!showAddSend ? (
              <button 
                onClick={() => setShowAddSend(true)}
                className="w-full py-4 border-2 border-dashed border-gray-300 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-2 text-gray-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all"
              >
                <Plus className="w-6 h-6" />
                <span className="text-sm font-bold">Thêm lượt gửi từ A</span>
              </button>
            ) : (
              <div className="bg-gray-50 dark:bg-slate-900 rounded-2xl border dark:border-slate-800 p-4 space-y-4 animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-800">Tạo lượt gửi mới</h3>
                  <button onClick={() => setShowAddSend(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-left py-2 text-gray-500">Loại</th>
                        {settings.workshops.map(w => <th key={w} className="py-2 text-gray-500">{w}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {settings.types.map(t => (
                        <tr key={t} className="border-t border-gray-200">
                          <td className="py-3 font-bold text-gray-700">{t}</td>
                          {settings.workshops.map((_, wi) => (
                            <td key={wi} className="py-2 px-1">
                              <input 
                                type="number" 
                                placeholder="0"
                                value={newSendItems[t]?.[wi] || ""}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value) || 0;
                                  const nr = [...(newSendItems[t] || new Array(settings.workshops.length).fill(0))];
                                  nr[wi] = v;
                                  setNewSendItems({ ...newSendItems, [t]: nr });
                                }}
                                className="w-full bg-white border rounded-lg py-1.5 text-center font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowAddSend(false)}
                    className="flex-1 py-3 bg-white border text-gray-600 font-bold rounded-xl hover:bg-gray-50"
                  >
                    Huỷ
                  </button>
                  <button 
                    onClick={submitNewSend}
                    className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700"
                  >
                    Gửi đi
                  </button>
                </div>
              </div>
            )}

            {/* Receives List */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-800 dark:text-slate-300">Lịch sử nhận hàng</h3>
              {Object.keys(collapsedBatchesA).length === 0 && ticketA.sends.filter(s => s.delivered).length === 0 && (
                <div className="text-center py-10 bg-gray-50 dark:bg-slate-900 rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-800">
                  <Clock className="w-8 h-8 text-gray-300 dark:text-slate-700 mx-auto mb-2" />
                  <p className="text-xs text-gray-400 dark:text-slate-500">Chưa có dữ liệu giao nhận</p>
                </div>
              )}
              
              {/* Group by batch */}
              {(() => {
                const batches: Record<number, SendOperation[]> = {};
                ticketA.sends.filter(s => s.delivered).forEach(s => {
                  const b = s.batch || 1;
                  if (!batches[b]) batches[b] = [];
                  batches[b].push(s);
                });
                
                return Object.keys(batches).sort((a, b) => parseInt(b) - parseInt(a)).map(bk => {
                  const bNum = parseInt(bk);
                  const bSends = batches[bNum];
                  const isCollapsed = collapsedBatchesA[bk];
                  const allDone = bSends.every(s => getSendStatus(s).status === "done");
                  
                  return (
                    <div key={bk} className={cn(
                      "border dark:border-slate-800 rounded-2xl overflow-hidden transition-all",
                      allDone ? "border-green-200 dark:border-green-900/30 bg-green-50/30 dark:bg-green-900/10" : "border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                    )}>
                      <button 
                        onClick={() => setCollapsedBatchesA(prev => ({ ...prev, [bk]: !prev[bk] }))}
                        className={cn(
                          "w-full px-4 py-3 flex items-center justify-between transition-colors",
                          allDone ? "bg-green-50 dark:bg-green-900/20" : "bg-gray-50 dark:bg-slate-800/50"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <ChevronDown className={cn("w-4 h-4 text-gray-400 dark:text-slate-500 transition-transform", isCollapsed && "-rotate-90")} />
                          <span className="font-bold text-sm dark:text-white">Lần {bk} {bSends.some(s => s.source === 'B') && "— Từ B"}</span>
                          <span className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">· {bSends[0].deliveredAt || bSends[0].time}</span>
                        </div>
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full",
                          allDone ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                        )}>
                          {allDone ? "Hoàn tất" : "Đang xử lý"}
                        </span>
                      </button>
                      
                      {!isCollapsed && (
                        <div className="p-3 space-y-2">
                          {bSends.map(send => {
                            const status = getSendStatus(send);
                            const isDone = status.status === "done";
                            return (
                              <div key={send.id} className={cn(
                                "p-3 rounded-xl border dark:border-slate-800 flex items-center justify-between gap-3",
                                isDone ? "bg-white dark:bg-slate-800 border-green-100 dark:border-green-900/20" : "bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/20"
                              )}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className={cn("font-bold text-sm", isDone ? "text-gray-400 dark:text-slate-500" : "text-gray-900 dark:text-white")}>
                                      {send.workshop}
                                    </span>
                                    <button 
                                      onClick={() => {
                                        setEditingSendWorkshop(send);
                                        setModal({ type: 'editSendWorkshop' });
                                      }}
                                      className="p-1 text-gray-400 hover:text-amber-600 transition-colors"
                                      title="Sửa xưởng/đích"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                    {send.source === 'B' && (
                                      <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-[9px] font-bold rounded">Từ B</span>
                                    )}
                                    {isDone && <Check className="w-3 h-3 text-green-500" />}
                                    {status.status === "partial" && (
                                      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                                        {status.recvTotal}/{status.sentTotal}
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-1.5 w-full max-w-[120px]">
                                    <div className="h-1.5 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                      <div 
                                        className={cn(
                                          "h-full transition-all duration-500",
                                          isDone ? "bg-green-500" : "bg-blue-500"
                                        )}
                                        style={{ width: `${Math.min(100, (status.recvTotal / status.sentTotal) * 100)}%` }}
                                      />
                                    </div>
                                  </div>
                                  <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 truncate">
                                    {Object.entries(send.actualItems || send.items).map(([k, v]) => `${k} ${v}`).join(", ")}
                                  </p>
                                </div>
                                <div className="flex gap-1.5">
                                  <button 
                                    onClick={() => {
                                      setHistorySend(send);
                                      setModal({ type: 'receiveHistory' });
                                    }}
                                    className="p-2 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    title="Lịch sử lấy hàng"
                                  >
                                    <Clock className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => {
                                      setReceivingPartialSend(send);
                                      const sentItems = send.actualItems || send.items;
                                      const receivesForSend = (ticketA.receives[send.workshop] || []).filter(r => r.forSendId === send.id);
                                      
                                      const remaining: Record<string, string> = {};
                                      Object.entries(sentItems).forEach(([k, v]) => {
                                        let recv = 0;
                                        receivesForSend.forEach(r => {
                                          recv += (r.items[k] || 0) + (r.errors?.[k] || 0);
                                        });
                                        remaining[k] = Math.max(0, (v as number) - recv).toString();
                                      });
                                      
                                      setPartialReceiveItems(remaining);
                                      setPartialReceiveErrors({});
                                      setModal({ type: 'partialReceive' });
                                    }}
                                    className="p-2 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    title="Cập nhật thực tế"
                                  >
                                    <ListChecks className="w-4 h-4" />
                                  </button>

                                  {!isDone ? (
                                    <button 
                                      onClick={() => {
                                        const sentItems = send.actualItems || send.items;
                                        const receivesForSend = (ticketA.receives[send.workshop] || []).filter(r => r.forSendId === send.id);
                                        
                                        const items: Record<string, number> = {};
                                        Object.entries(sentItems).forEach(([k, v]) => {
                                          let recv = 0;
                                          receivesForSend.forEach(r => {
                                            recv += (r.items[k] || 0) + (r.errors?.[k] || 0);
                                          });
                                          const rem = Math.max(0, (v as number) - recv);
                                          if (rem > 0) items[k] = rem;
                                        });

                                        setModal({
                                          type: 'confirmFullReceive',
                                          send,
                                          items,
                                          onOk: () => {
                                            const nr: ReceiveOperation = {
                                              id: (ticketA.receives[send.workshop]?.length || 0) + 1,
                                              time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
                                              by: "Bạn",
                                              items,
                                              errors: {},
                                              forSendId: send.id
                                            };
                                            updateData(prev => ({
                                              ticketsA: {
                                                ...prev.ticketsA,
                                                [currentDate]: {
                                                  ...ticketA,
                                                  receives: {
                                                    ...ticketA.receives,
                                                    [send.workshop]: [...(ticketA.receives[send.workshop] || []), nr]
                                                  }
                                                }
                                              }
                                            }));
                                            setModal(null);
                                            showToast(`Đã nhận đủ hàng từ ${send.workshop}`);
                                          }
                                        });
                                      }}
                                      className="p-2 bg-gray-200 text-gray-400 rounded-lg shadow-sm hover:bg-blue-600 hover:text-white transition-all"
                                      title="Xác nhận đủ"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                  ) : (
                                    <button 
                                      onClick={() => {
                                        setModal({
                                          type: 'confirm',
                                          title: "Huỷ nhận hàng?",
                                          msg: `Bạn muốn huỷ lần nhận hàng cuối của ${send.workshop} L${send.batch}?`,
                                          onOk: () => {
                                            updateData(prev => {
                                              const newRecs = { ...ticketA.receives };
                                              const arr = [...(newRecs[send.workshop] || [])];
                                              for (let i = arr.length - 1; i >= 0; i--) {
                                                if (arr[i].forSendId === send.id) {
                                                  arr.splice(i, 1);
                                                  break;
                                                }
                                              }
                                              newRecs[send.workshop] = arr;
                                              return {
                                                ticketsA: {
                                                  ...prev.ticketsA,
                                                  [currentDate]: { ...ticketA, receives: newRecs }
                                                }
                                              };
                                            });
                                            setModal(null);
                                            showToast("Đã huỷ lần nhận hàng");
                                          }
                                        });
                                      }}
                                      className="p-2 bg-blue-600 text-white rounded-lg shadow-md"
                                      title="Đã nhận đủ - Click để huỷ"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {tab === 'SETTINGS' && isAdmin && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <LayoutDashboard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Cấu hình hệ thống</h2>
                <p className="text-xs text-gray-500 dark:text-slate-400">Quản lý xưởng và loại gia công</p>
              </div>
            </div>

            {/* Workshops Management */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-500" />
                  Danh sách Xưởng
                </h3>
              </div>
              <div className="p-4 space-y-3">
                {settings.workshops.map((ws, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input 
                      type="text"
                      value={ws}
                      onChange={(e) => {
                        const newWs = [...settings.workshops];
                        newWs[idx] = e.target.value;
                        setSettings({ ...settings, workshops: newWs });
                      }}
                      className="flex-1 bg-gray-50 dark:bg-slate-800 border dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                    />
                    <button 
                      onClick={() => {
                        const newWs = settings.workshops.filter((_, i) => i !== idx);
                        setSettings({ ...settings, workshops: newWs });
                      }}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button 
                  onClick={() => setSettings({ ...settings, workshops: [...settings.workshops, "Xưởng mới"] })}
                  className="w-full py-2 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Thêm xưởng
                </button>
              </div>
            </div>

            {/* Types Management */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <Package className="w-4 h-4 text-purple-500" />
                  Loại gia công
                </h3>
              </div>
              <div className="p-4 space-y-3">
                {settings.types.map((t, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input 
                      type="text"
                      value={t}
                      onChange={(e) => {
                        const newTypes = [...settings.types];
                        newTypes[idx] = e.target.value;
                        setSettings({ ...settings, types: newTypes });
                      }}
                      className="flex-1 bg-gray-50 dark:bg-slate-800 border dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                    />
                    <button 
                      onClick={() => {
                        const newTypes = settings.types.filter((_, i) => i !== idx);
                        setSettings({ ...settings, types: newTypes });
                      }}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button 
                  onClick={() => setSettings({ ...settings, types: [...settings.types, "Loại mới"] })}
                  className="w-full py-2 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Thêm loại gia công
                </button>
              </div>
            </div>

            {/* Notification Management */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                  Thông báo & PWA
                </h3>
              </div>
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-200">Trạng thái thông báo</p>
                    <p className="text-[10px] text-gray-500 dark:text-slate-400">
                      {notificationPermission === 'granted' ? 'Đã bật' : notificationPermission === 'denied' ? 'Bị chặn' : 'Chưa thiết lập'}
                    </p>
                  </div>
                  <button 
                    onClick={requestNotificationPermission}
                    disabled={notificationPermission === 'granted'}
                    className={cn(
                      "px-4 py-1.5 rounded-xl text-xs font-bold transition-all",
                      notificationPermission === 'granted' 
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" 
                        : "bg-blue-600 text-white shadow-md shadow-blue-100 dark:shadow-none"
                    )}
                  >
                    {notificationPermission === 'granted' ? 'Đã kết nối' : 'Bật thông báo'}
                  </button>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/30">
                  <p className="text-[10px] text-blue-700 dark:text-blue-400 font-medium leading-relaxed">
                    Mẹo: "Thêm vào màn hình chính" (Add to Home Screen) để trải nghiệm như ứng dụng thật và nhận thông báo ngay cả khi không mở trình duyệt.
                  </p>
                </div>
              </div>
            </div>

            <button 
              onClick={async () => {
                try {
                  await setDoc(doc(db, 'settings', 'global'), settings);
                  setToast("Đã lưu cấu hình hệ thống!");
                } catch (err) {
                  console.error("Save settings error:", err);
                  setToast("Lỗi khi lưu cấu hình!");
                }
              }}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 dark:shadow-none hover:bg-blue-700 transition-all"
            >
              Lưu thay đổi
            </button>
          </div>
        )}

        {tab === 'BM' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{ticketB.id}</h2>
                <p className="text-xs text-gray-500 mt-1">Lấy hàng kho B · {ticketB.date} · {ticketB.creator}</p>
              </div>
              <span className="px-2.5 py-1 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-full">
                Quản lý
              </span>
            </div>

            {/* Batch List */}
            {(() => {
              const batches: Record<number, TicketBItem[]> = {};
              ticketB.items.forEach(it => {
                const b = it.batch || 1;
                if (!batches[b]) batches[b] = [];
                batches[b].push(it);
              });
              const batchKeys = Object.keys(batches).sort((a, b) => parseInt(a) - parseInt(b));

              if (batchKeys.length === 0) {
                return (
                  <div className="text-center py-16 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                    <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-sm font-bold text-gray-500">Chưa có lượt lấy hàng nào</p>
                    <p className="text-xs text-gray-400 mt-1">Bấm nút bên dưới để bắt đầu</p>
                  </div>
                );
              }

              return batchKeys.map(bk => {
                const bItems = batches[parseInt(bk)];
                return (
                  <div key={bk} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-800 tracking-tight">Lần {bk}</h3>
                      <span className="text-[10px] font-bold text-gray-400 bg-white px-2 py-0.5 rounded border">
                        {bItems.length} SP · {bItems.reduce((s, i) => s + i.requested, 0)} chiếc
                      </span>
                    </div>
                    <div className="divide-y">
                      {bItems.map(item => (
                        <div key={item.sku} className="p-4 hover:bg-gray-50 transition-colors">
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-bold text-sm text-gray-900 leading-tight">{item.name}</h4>
                              <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wider">
                                {item.category} · Tổng <span className="text-blue-600">{item.requested}</span>
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <button 
                                onClick={() => {
                                  setProductForm({ mode: 'edit', sku: item.sku });
                                  setFormProductSku(item.sku);
                                  setFormProductAlloc([...item.allocation]);
                                  setModal({ type: 'productForm' });
                                }}
                                className="p-1.5 bg-amber-50 text-amber-600 rounded-lg border border-amber-100"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => {
                                  setModal({
                                    type: 'confirm',
                                    title: "Xoá sản phẩm?",
                                    msg: `Bạn muốn xoá ${item.name} khỏi danh sách?`,
                                    onOk: () => {
                                      updateData(prev => ({
                                        ticketsB: {
                                          ...prev.ticketsB,
                                          [currentDate]: {
                                            ...ticketB,
                                            items: ticketB.items.filter(i => i.sku !== item.sku)
                                          }
                                        }
                                      }));
                                      setModal(null);
                                      showToast("Đã xoá sản phẩm");
                                    }
                                  });
                                }}
                                className="p-1.5 bg-red-50 text-red-600 rounded-lg border border-red-100"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {destinations.map((d, i) => item.allocation[i] > 0 && (
                              <span key={d} className="text-[9px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md border border-blue-100">
                                {d}: {item.allocation[i]}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={() => {
                        setProductForm({ mode: 'add', batch: parseInt(bk) });
                        setFormProductSku("");
                        setFormProductAlloc(new Array(destinations.length).fill(0));
                        setModal({ type: 'productForm' });
                      }}
                      className="w-full py-3 text-xs font-bold text-blue-600 hover:bg-blue-50 transition-colors border-t border-dashed"
                    >
                      + Thêm sản phẩm vào Lần {bk}
                    </button>
                  </div>
                );
              });
            })()}

            <button 
              onClick={() => {
                const nextBatch = Math.max(0, ...ticketB.items.map(i => i.batch || 1)) + 1;
                setProductForm({ mode: 'add', batch: nextBatch });
                setFormProductSku("");
                setFormProductAlloc(new Array(destinations.length).fill(0));
                setModal({ type: 'productForm' });
              }}
              className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 hover:bg-blue-700 transition-all"
            >
              <Plus className="w-5 h-5" />
              <span>Tạo lượt lấy mới</span>
            </button>
          </div>
        )}

        {tab === 'BS' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{ticketB.id}</h2>
                <p className="text-xs text-gray-500 mt-1">Kho B → Đích đến · {ticketB.date}</p>
              </div>
              <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 text-[10px] font-bold rounded-full">
                Nhân viên
              </span>
            </div>

            {/* Staff Batch List */}
            {(() => {
              const batches: Record<number, TicketBItem[]> = {};
              ticketB.items.forEach(it => {
                const b = it.batch || 1;
                if (!batches[b]) batches[b] = [];
                batches[b].push(it);
              });
              const batchKeys = Object.keys(batches).sort((a, b) => parseInt(a) - parseInt(b));

              if (batchKeys.length === 0) {
                return (
                  <div className="text-center py-16 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                    <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-sm font-bold text-gray-500">Chưa có yêu cầu lấy hàng</p>
                  </div>
                );
              }

              return batchKeys.map(bk => {
                const bNum = parseInt(bk);
                const bItems = batches[bNum];
                const isCollapsed = collapsedBatches[bk];
                
                const photoDone = bItems.filter(i => i.photoTaken).length;
                const actualDone = bItems.filter(i => i.actual !== null).length;
                const allDone = photoDone === bItems.length && actualDone === bItems.length;
                
                return (
                  <div key={bk} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                    <button 
                      onClick={() => setCollapsedBatches(prev => ({ ...prev, [bk]: !prev[bk] }))}
                      className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between border-b"
                    >
                      <div className="flex items-center gap-3">
                        <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", isCollapsed && "-rotate-90")} />
                        <span className="font-bold text-sm">Lần {bk}</span>
                        {bItems.some(i => i.deliveries && Object.values(i.deliveries).some(d => d.delivered)) && (
                          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[9px] font-bold rounded">Từ B</span>
                        )}
                        <span className="text-[10px] text-gray-400 font-medium">· {bItems.length} SP</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {bItems.some(i => i.actual !== null && i.actual !== i.requested && i.realAllocation === null) && (
                          <span className="text-[9px] font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                            Cần phân chia
                          </span>
                        )}
                        <span className={cn(
                          "text-[9px] font-bold px-2 py-0.5 rounded-full",
                          allDone ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        )}>
                          {allDone ? "Đã lấy đủ" : `${actualDone}/${bItems.length} đã lấy`}
                        </span>
                      </div>
                    </button>
                    
                    {!isCollapsed && (
                      <div className="p-3 space-y-3">
                        {bItems.map(item => {
                          const isItemDone = item.photoTaken && item.actual !== null;
                          const hasLech = item.actual !== null && item.actual !== item.requested;
                          
                          return (
                            <div key={item.sku} className={cn(
                              "p-3 rounded-xl border transition-all",
                              isItemDone ? "bg-white border-gray-200" : "bg-blue-50/30 border-blue-100"
                            )}>
                              <div className="flex gap-3">
                                <button 
                                  onClick={() => {
                                    updateData(prev => ({
                                      ticketsB: {
                                        ...prev.ticketsB,
                                        [currentDate]: {
                                          ...ticketB,
                                          items: ticketB.items.map(i => i.sku === item.sku ? { ...i, photoTaken: true } : i)
                                        }
                                      }
                                    }));
                                    showToast("Đã chụp ảnh sản phẩm");
                                  }}
                                  className={cn(
                                    "w-12 h-12 rounded-xl border-2 flex flex-col items-center justify-center gap-0.5 transition-all shrink-0",
                                    item.photoTaken ? "bg-green-50 border-green-500 text-green-600" : "bg-gray-50 border-dashed border-gray-300 text-gray-400"
                                  )}
                                >
                                  {item.photoTaken ? <Check className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
                                  <span className="text-[8px] font-bold uppercase">Ảnh</span>
                                </button>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-bold text-sm text-gray-900 leading-tight">{item.name}</h4>
                                  <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wider">
                                    {item.category}
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {destinations.map((d, i) => {
                                      const val = item.realAllocation ? item.realAllocation[i] : item.allocation[i];
                                      if (val <= 0) return null;
                                      return (
                                        <span key={d} className={cn(
                                          "text-[8px] font-bold px-1.5 py-0.5 rounded",
                                          item.realAllocation ? "bg-blue-50 text-blue-700 border border-blue-100" : "bg-gray-100 text-gray-500"
                                        )}>
                                          {d}: {val}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="mt-3 pt-3 border-t flex items-center justify-between">
                                <div className="flex items-baseline gap-2">
                                  <span className="text-[10px] font-bold text-gray-400 uppercase">Yêu cầu</span>
                                  <span className="text-lg font-bold text-gray-900">{item.requested}</span>
                                  {item.actual !== null && (
                                    <>
                                      <span className="text-gray-300">→</span>
                                      <span className={cn(
                                        "text-lg font-bold",
                                        item.actual === item.requested ? "text-green-600" : "text-amber-600"
                                      )}>
                                        {item.actual}
                                      </span>
                                    </>
                                  )}
                                </div>
                                <button 
                                  onClick={() => {
                                    setEditingItem(item.sku);
                                    setEditActual(item.actual ?? item.requested);
                                    setEditNote(item.note || "");
                                    setModal({ type: 'editActual' });
                                  }}
                                  className={cn(
                                    "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                                    item.actual !== null ? "bg-gray-100 text-gray-600" : "bg-blue-600 text-white shadow-md shadow-blue-100"
                                  )}
                                >
                                  {item.actual !== null ? "Sửa số" : "Nhập số"}
                                </button>
                              </div>
                              {hasLech && item.note && (
                                <div className="mt-2 p-2 bg-amber-50 rounded-lg border border-amber-100 flex gap-2">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                  <p className="text-[10px] text-amber-800 font-medium leading-relaxed">
                                    <strong>Lệch {Math.abs(item.requested - (item.actual || 0))}:</strong> {item.note}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!isCollapsed && bItems.every(i => i.actual !== null) && bItems.some(i => i.actual !== i.requested) && (
                      <div className="p-3 border-t bg-gray-50/50 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-gray-800">Bước 1.5: Phân chia lại</h3>
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold rounded">Có lệch</span>
                          </div>
                        </div>

                        <div className="bg-amber-50 p-3 rounded-xl border border-amber-100">
                          <p className="text-[10px] text-amber-800 font-medium leading-relaxed">
                            Số mặc định = phân chia ban đầu. Điều chỉnh để tổng khớp với số thực tế đã lấy.
                          </p>
                        </div>

                        <div className="space-y-4">
                          {bItems.filter(i => i.actual !== null && i.actual !== i.requested).map(item => {
                            const currentAlloc = reAllocInputs[item.sku] || item.allocation.map(v => v.toString());
                            const totalAlloc = currentAlloc.reduce((sum, v) => sum + (parseInt(v) || 0), 0);
                            const diff = (item.actual || 0) - totalAlloc;

                            return (
                              <div key={item.sku} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                                <div className="flex justify-between items-center mb-3">
                                  <h4 className="text-xs font-bold text-gray-700">{item.name}</h4>
                                  <div className="text-[10px] font-bold">
                                    <span className="text-gray-400">YC {item.requested} · </span>
                                    <span className="text-amber-600">thực {item.actual}</span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-5 gap-2 items-end">
                                  {destinations.map((dest, dIdx) => (
                                    <div key={dest} className="space-y-1">
                                      <label className="text-[8px] font-bold text-gray-400 uppercase text-center block">{dest}</label>
                                      <input 
                                        type="number"
                                        value={currentAlloc[dIdx]}
                                        onChange={(e) => {
                                          const newVal = e.target.value;
                                          const next = [...currentAlloc];
                                          next[dIdx] = newVal;
                                          setReAllocInputs(prev => ({ ...prev, [item.sku]: next }));
                                        }}
                                        className="w-full bg-white border border-gray-200 rounded-lg py-1.5 text-center text-xs font-bold focus:border-blue-500 focus:outline-none"
                                      />
                                    </div>
                                  ))}
                                  <div className="space-y-1">
                                    <label className="text-[8px] font-bold text-gray-400 uppercase text-center block">Tổng</label>
                                    <div className={cn(
                                      "w-full py-1.5 text-center text-xs font-bold rounded-lg",
                                      diff === 0 ? "text-green-600" : "text-red-600"
                                    )}>
                                      {totalAlloc}
                                    </div>
                                  </div>
                                </div>
                                {diff !== 0 && (
                                  <p className="text-[9px] text-red-500 font-bold mt-2 text-right">
                                    {diff > 0 ? `Thiếu ${diff}` : `Thừa ${Math.abs(diff)}`} so với thực tế
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <button 
                          onClick={() => {
                            const itemsToUpdate = bItems.filter(i => i.actual !== null && i.actual !== i.requested);
                            let allMatch = true;
                            
                            itemsToUpdate.forEach(item => {
                              const currentAlloc = reAllocInputs[item.sku] || item.allocation.map(v => v.toString());
                              const totalAlloc = currentAlloc.reduce((sum, v) => sum + (parseInt(v) || 0), 0);
                              if (totalAlloc !== item.actual) allMatch = false;
                            });

                            if (!allMatch) {
                              showToast("Tổng phân chia mỗi sản phẩm phải bằng số thực tế đã lấy");
                              return;
                            }

                            updateData(prev => {
                              const newItems = ticketB.items.map(item => {
                                if (item.batch === bNum && item.actual !== null && item.actual !== item.requested) {
                                  const alloc = (reAllocInputs[item.sku] || item.allocation.map(v => v.toString())).map(v => parseInt(v) || 0);
                                  return { ...item, realAllocation: alloc };
                                }
                                return item;
                              });
                              
                              let nextData = {
                                ...prev,
                                ticketsB: {
                                  ...prev.ticketsB,
                                  [currentDate]: { ...ticketB, items: newItems }
                                }
                              };

                              // Sync to A
                              const ticketA = prev.ticketsA[currentDate];
                              if (ticketA) {
                                let newSendsA = [...ticketA.sends];
                                const at = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
                                const bItems = newItems.filter(i => i.batch === bNum);
                                const existingSourceBatch = ticketA.sends.find(s => s.source === 'B' && s.sourceBatch === bNum);
                                const batchToUse = existingSourceBatch ? existingSourceBatch.batch : (Math.max(0, ...ticketA.sends.map(s => s.batch || 1)) + 1);

                                destinations.forEach(dest => {
                                  const dIdx = destinations.indexOf(dest);
                                  const itemsForDest: { sku: string, name: string, qty: number }[] = [];
                                  bItems.forEach(bi => {
                                    const alloc = bi.realAllocation || bi.allocation;
                                    if (alloc[dIdx] > 0) itemsForDest.push({ sku: bi.sku, name: bi.name, qty: alloc[dIdx] });
                                  });
                                  if (itemsForDest.length === 0) return;
                                  const totalQty = itemsForDest.reduce((s, i) => s + i.qty, 0);
                                  const existingSend = newSendsA.find(s => 
                                    s.source === 'B' && 
                                    s.sourceBatch === bNum && 
                                    (s.workshopIdx === dIdx || s.workshop === dest)
                                  );
                                  if (!existingSend) {
                                    const nextId = Math.max(0, ...newSendsA.map(s => s.id)) + 1;
                                    newSendsA.push({
                                      id: nextId, batch: batchToUse, source: 'B', workshop: dest, time: at,
                                      items: aggregateByCategory(itemsForDest), delivered: false,
                                      bSourceItems: itemsForDest.map(i => ({ sku: i.sku, name: i.name, qty: i.qty })),
                                      sourceBatch: bNum,
                                      workshopIdx: dIdx
                                    });
                                  } else if (!existingSend.delivered) {
                                    existingSend.items = aggregateByCategory(itemsForDest);
                                    existingSend.bSourceItems = itemsForDest.map(i => ({ sku: i.sku, name: i.name, qty: i.qty }));
                                    existingSend.workshop = dest;
                                    existingSend.workshopIdx = dIdx;
                                  }
                                });
                                nextData.ticketsA[currentDate] = { ...ticketA, sends: newSendsA };
                              }
                              return nextData;
                            });
                            showToast("Đã xác nhận phân chia Lần " + bk);
                          }}
                          className={cn(
                            "w-full py-3 font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2",
                            bItems.filter(i => i.actual !== null && i.actual !== i.requested).every(item => {
                              const currentAlloc = reAllocInputs[item.sku] || item.allocation.map(v => v.toString());
                              const totalAlloc = currentAlloc.reduce((sum, v) => sum + (parseInt(v) || 0), 0);
                              return totalAlloc === item.actual;
                            }) 
                              ? "bg-blue-600 text-white shadow-blue-100" 
                              : "bg-blue-300 text-white cursor-not-allowed"
                          )}
                        >
                          Xác nhận phân chia Lần {bk}
                        </button>
                        <p className="text-[9px] text-red-500 font-bold text-center">
                          Tổng phân chia mỗi sản phẩm phải bằng số thực tế đã lấy
                        </p>
                      </div>
                    )}

                    {!isCollapsed && (
                      (() => {
                        const step1Done = bItems.every(i => i.actual !== null);
                        const needsRealloc = bItems.some(i => i.actual !== null && i.actual !== i.requested);
                        const reallocDone = bItems.filter(i => i.actual !== null && i.actual !== i.requested).every(i => i.realAllocation !== null);
                        
                        if (!step1Done) return null;
                        if (needsRealloc && !reallocDone) return null;
                        
                        // Step 2: Delivery
                        return (
                          <div className="p-3 border-t bg-gray-50/50 space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-bold text-gray-800">Bước 2: Giao hàng cho từng đích đến</h3>
                            </div>

                            <div className="space-y-3">
                              {destinations.map(dest => {
                                const itemsForDest: { name: string, qty: number }[] = [];
                                bItems.forEach(item => {
                                  const alloc = item.realAllocation || item.allocation;
                                  const dIdx = destinations.indexOf(dest);
                                  if (alloc[dIdx] > 0) {
                                    itemsForDest.push({ name: item.name, qty: alloc[dIdx] });
                                  }
                                });

                                if (itemsForDest.length === 0) return null;

                                const totalQty = itemsForDest.reduce((s, i) => s + i.qty, 0);
                                const dIdx = destinations.indexOf(dest);
                                const sendInA = ticketA.sends.find(s => 
                                  s.source === 'B' && 
                                  s.sourceBatch === bNum && 
                                  (s.workshopIdx === dIdx || s.workshop === dest)
                                );
                                // Use Ticket B items' deliveries as primary source of truth for NV view
                                const isDelivered = bItems.some(i => i.deliveries?.[dest]?.delivered) || (sendInA ? sendInA.delivered : false);

                                return (
                                  <div key={dest} className="bg-amber-50/50 p-3 rounded-xl border border-amber-100 shadow-sm">
                                    <div className="flex justify-between items-start">
                                      <div className="flex-1">
                                        <h4 className="text-sm font-bold text-gray-800">{dest}</h4>
                                        <p className="text-[10px] text-gray-500 mt-1 leading-tight">
                                          {itemsForDest.map(i => `${i.name} ${i.qty}`).join(", ")} · <strong>tổng {totalQty}</strong>
                                        </p>
                                        {isDelivered && (
                                          <p className="text-[9px] font-bold text-purple-600 mt-2 flex items-center gap-1">
                                            <Check className="w-3 h-3" />
                                            Đã xác nhận giao
                                          </p>
                                        )}
                                      </div>
                                        {!isDelivered ? (
                                          <button 
                                            onClick={() => {
                                              setDeliveryConfirmDest({ name: dest, idx: dIdx, bNum });
                                              setDeliveryConfirmItems(itemsForDest.map(i => {
                                                const item = bItems.find(bi => bi.name === i.name);
                                                return { sku: item?.sku || "", name: i.name, qty: i.qty };
                                              }));
                                              setModal({ type: 'confirmDelivery' });
                                            }}
                                            className="px-3 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg shadow-md shadow-amber-100"
                                          >
                                            Xác nhận giao
                                          </button>
                                      ) : (
                                        <div className="p-2 bg-green-100 text-green-600 rounded-lg">
                                          <Check className="w-4 h-4" />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}
        {tab === 'PROD' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Danh mục sản phẩm</h2>
                <p className="text-xs text-gray-500 mt-1">Quản lý và import dữ liệu</p>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <label className="cursor-pointer bg-blue-50 text-blue-600 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-blue-100 transition-colors">
                    <Plus className="w-4 h-4" />
                    Import Excel
                    <input 
                      type="file" 
                      accept=".xlsx, .xls, .csv" 
                      className="hidden" 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = async (evt) => {
                          try {
                            const bstr = evt.target?.result;
                            const wb = XLSX.read(bstr, { type: 'binary' });
                            const wsname = wb.SheetNames[0];
                            const ws = wb.Sheets[wsname];
                            const data = XLSX.utils.sheet_to_json(ws) as any[];
                            const newProducts: Product[] = data.map((row, idx) => ({
                              sku: String(row.SKU || row.sku || `p-${Date.now()}-${idx}`),
                              name: String(row.Name || row.name || row['Tên sản phẩm'] || "Sản phẩm không tên"),
                              category: String(row.Category || row.category || row['Danh mục'] || "Vỏ chăn")
                            }));
                            if (newProducts.length === 0) {
                              showToast("Không tìm thấy dữ liệu!");
                              return;
                            }
                            await updateData(prev => ({ products: [...prev.products, ...newProducts] }));
                            showToast(`Đã import ${newProducts.length} sản phẩm!`);
                          } catch (err) {
                            showToast("Lỗi đọc file!");
                          }
                        };
                        reader.readAsBinaryString(file);
                      }}
                    />
                  </label>
                </div>
              )}
            </div>

            {!user && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-900">Bạn chưa đăng nhập</p>
                  <p className="text-xs text-amber-700 mt-1">Vui lòng đăng nhập để đồng bộ dữ liệu sản phẩm với hệ thống.</p>
                </div>
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Tìm kiếm sản phẩm..."
                className="w-full pl-10 pr-4 py-3 bg-white border-2 border-gray-100 rounded-2xl text-sm focus:border-blue-500 focus:outline-none transition-all shadow-sm"
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>

            <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
              <div className="divide-y">
                {state.products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku.toLowerCase().includes(productSearch.toLowerCase())).map(p => (
                  <div key={p.sku} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                        <Package className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">{p.name}</h4>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{p.sku} · {p.category}</p>
                      </div>
                    </div>
                    {isAdmin && (
                      <button 
                        onClick={() => {
                          setModal({
                            type: 'confirm',
                            title: 'Xoá sản phẩm',
                            msg: `Bạn có chắc chắn muốn xoá sản phẩm "${p.name}"?`,
                            onOk: () => {
                              updateData(prev => ({
                                products: prev.products.filter(x => x.sku !== p.sku)
                              }));
                              setModal(null);
                              showToast("Đã xoá sản phẩm");
                            }
                          });
                        }}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                {state.products.length === 0 && (
                  <div className="p-12 text-center">
                    <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm font-bold text-gray-400">Chưa có sản phẩm nào</p>
                    <p className="text-[10px] text-gray-400 mt-1">Hãy import từ file Excel để bắt đầu</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {tab === 'USERS' && isAdmin && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <button 
                  onClick={() => setTab('A')}
                  className="p-1 -ml-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-400" />
                </button>
                <h2 className="text-xl font-bold text-gray-900">Quản lý nhân sự</h2>
              </div>
              <p className="text-xs text-gray-500 ml-7">Phân quyền và cấp tài khoản</p>
            </div>

            {/* Create Staff Form */}
            <div className="bg-white rounded-3xl border shadow-sm p-6">
              <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600" />
                Cấp tài khoản mới
              </h3>
              <form onSubmit={createStaffAccount} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">Tên đăng nhập</label>
                    <input 
                      type="text" 
                      required
                      value={newStaffUsername}
                      onChange={(e) => setNewStaffUsername(e.target.value)}
                      className="w-full px-3 py-2.5 bg-gray-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-xl text-xs outline-none transition-all"
                      placeholder="Ví dụ: hung_nv"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">Mật khẩu</label>
                    <input 
                      type="text" 
                      required
                      value={newStaffPassword}
                      onChange={(e) => setNewStaffPassword(e.target.value)}
                      className="w-full px-3 py-2.5 bg-gray-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-xl text-xs outline-none transition-all"
                      placeholder="Tối thiểu 6 ký tự"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">Tên hiển thị</label>
                  <input 
                    type="text" 
                    required
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-xl text-xs outline-none transition-all"
                    placeholder="Ví dụ: Nguyễn Văn Hùng"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isCreatingStaff}
                  className="w-full py-3 bg-blue-600 text-white text-xs font-bold rounded-2xl shadow-lg shadow-blue-100 disabled:opacity-50 active:scale-[0.98] transition-all"
                >
                  {isCreatingStaff ? "Đang xử lý..." : "Tạo và cấp tài khoản"}
                </button>
              </form>
            </div>

            <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-gray-50/50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">Danh sách nhân sự</h3>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-[10px] font-bold rounded-full">
                  {allUsers.length} thành viên
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50 border-b">
                      <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nhân viên</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tên đăng nhập</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Quyền</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {allUsers.sort((a, b) => (a.role === 'admin' ? -1 : 1)).map((u) => (
                      <tr key={u.uid} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm",
                              u.role === 'admin' ? "bg-purple-600 text-white" : "bg-blue-100 text-blue-600"
                            )}>
                              {u.displayName?.charAt(0) || u.email?.charAt(0)}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-gray-900">{u.displayName}</div>
                              <div className="text-[10px] text-gray-500">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-xs text-gray-600 font-mono">
                          {u.email?.split('@')[0]}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {u.role !== 'admin' ? (
                            <button 
                              onClick={() => toggleUserRole(u)}
                              className={cn(
                                "px-2 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-95",
                                u.role === 'manager' ? "bg-orange-50 text-orange-600 border border-orange-100" : "bg-blue-50 text-blue-600 border border-blue-100"
                              )}
                            >
                              {u.role === 'manager' ? 'QUẢN LÝ' : 'NHÂN VIÊN'}
                            </button>
                          ) : (
                            <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-purple-50 text-purple-600 border border-purple-100">
                              QUẢN TRỊ
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {u.email !== 'trungg9870@gmail.com' && (
                            <button 
                              onClick={() => {
                                setModal({
                                  type: 'confirm',
                                  title: 'Xoá tài khoản',
                                  msg: `Bạn có chắc chắn muốn xoá tài khoản của "${u.displayName}"? Nhân viên này sẽ không thể đăng nhập được nữa.`,
                                  onOk: async () => {
                                    try {
                                      // Note: Deleting from Auth requires Admin SDK, for now we just remove from Firestore
                                      // In a real app, we'd call a server API to delete from Auth too
                                      await setDoc(doc(db, 'users', u.uid), { ...u, status: 'disabled', role: 'disabled' });
                                      showToast("Đã vô hiệu hoá tài khoản");
                                      setModal(null);
                                    } catch (err) {
                                      showToast("Lỗi thao tác!");
                                    }
                                  }
                                });
                              }}
                              className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Guide Box */}
            <div className="p-5 bg-blue-50/50 border border-blue-100 rounded-3xl">
              <h4 className="text-xs font-bold text-blue-900 mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Hướng dẫn cấp quyền
              </h4>
              <ul className="space-y-2">
                <li className="text-[11px] text-blue-700 leading-relaxed flex gap-2">
                  <span className="font-bold">•</span>
                  <span>Admin có thể tạo tài khoản cho nhân viên bằng <b>Tên đăng nhập</b> và <b>Mật khẩu</b>.</span>
                </li>
                <li className="text-[11px] text-blue-700 leading-relaxed flex gap-2">
                  <span className="font-bold">•</span>
                  <span>Bấm vào nhãn <b>"NHÂN VIÊN"</b> trong danh sách để nâng cấp thành <b>"QUẢN LÝ"</b>.</span>
                </li>
                <li className="text-[11px] text-blue-700 leading-relaxed flex gap-2">
                  <span className="font-bold">•</span>
                  <span><b>Quản lý</b>: Xem được tất cả các phiếu (A, B QL, B NV).</span>
                </li>
                <li className="text-[11px] text-blue-700 leading-relaxed flex gap-2">
                  <span className="font-bold">•</span>
                  <span><b>Nhân viên</b>: Chỉ xem được Phiếu A và Phiếu B NV.</span>
                </li>
              </ul>
            </div>

            <div className="p-4 bg-blue-50 rounded-2xl">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Hướng dẫn</p>
              <p className="text-xs text-blue-700 leading-relaxed">
                Nhân viên mới chỉ cần đăng nhập bằng Google. Sau khi đăng nhập lần đầu, họ sẽ xuất hiện ở danh sách này với quyền mặc định là <strong>Nhân viên</strong>. Bạn có thể nâng cấp họ lên <strong>Quản lý</strong> tại đây.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[9999] bg-gray-900 text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-2xl flex items-center gap-3 min-w-[280px] max-w-[90vw] text-center justify-center"
          >
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <Modal 
        isOpen={modal?.type === 'partialReceive'} 
        onClose={() => setModal(null)}
        title="Cập nhật thực tế nhận hàng"
        footer={
          <>
            <button onClick={() => setModal(null)} className="flex-1 py-3 bg-white border text-gray-600 font-bold rounded-xl">Huỷ</button>
            <button 
              onClick={() => {
                if (!receivingPartialSend) return;
                
                const finalItems: Record<string, number> = {};
                const finalErrors: Record<string, number> = {};
                
                Object.keys(partialReceiveItems).forEach(k => {
                  finalItems[k] = parseInt(partialReceiveItems[k]) || 0;
                });
                Object.keys(partialReceiveErrors).forEach(k => {
                  finalErrors[k] = parseInt(partialReceiveErrors[k]) || 0;
                });

                const nr: ReceiveOperation = {
                  id: (ticketA.receives[receivingPartialSend.workshop]?.length || 0) + 1,
                  time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
                  by: "Bạn",
                  items: finalItems,
                  errors: finalErrors,
                  forSendId: receivingPartialSend.id
                };
                updateData(prev => ({
                  ticketsA: {
                    ...prev.ticketsA,
                    [currentDate]: {
                      ...ticketA,
                      receives: {
                        ...ticketA.receives,
                        [receivingPartialSend.workshop]: [...(ticketA.receives[receivingPartialSend.workshop] || []), nr]
                      }
                    }
                  }
                }));
                setModal(null);
                showToast(`Đã cập nhật số lượng nhận từ ${receivingPartialSend.workshop}`);
              }}
              className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200"
            >
              Xác nhận
            </button>
          </>
        }
      >
        {receivingPartialSend && (
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
              <p className="text-xs font-bold text-blue-800 uppercase tracking-wider">Nhận hàng từ</p>
              <h4 className="text-lg font-bold text-blue-900 mt-1">{receivingPartialSend.workshop}</h4>
              <p className="text-xs text-blue-600 mt-0.5">Lần {receivingPartialSend.batch} · Giao lúc {receivingPartialSend.deliveredAt}</p>
            </div>

            {receivingPartialSend.source === 'B' && receivingPartialSend.bSourceItems && (
              <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
                <p className="text-[10px] font-bold text-purple-800 uppercase mb-2">Chi tiết hàng từ B</p>
                <div className="space-y-1">
                  {receivingPartialSend.bSourceItems.map((si, idx) => (
                    <div key={idx} className="flex justify-between text-xs">
                      <span className="text-purple-700">{si.name}</span>
                      <span className="font-bold text-purple-900">{si.qty}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase px-1">
                <span>Loại hàng</span>
                <div className="flex gap-4">
                  <span className="w-16 text-center">Số lượng gửi</span>
                  <span className="w-16 text-center">Thực nhận</span>
                </div>
              </div>
              {Object.entries(receivingPartialSend.actualItems || receivingPartialSend.items).map(([k, v]) => {
                const receivesForSend = (ticketA.receives[receivingPartialSend.workshop] || []).filter(r => r.forSendId === receivingPartialSend.id);
                let alreadyRecv = 0;
                receivesForSend.forEach(r => {
                  alreadyRecv += (r.items[k] || 0) + (r.errors?.[k] || 0);
                });
                const rem = Math.max(0, (v as number) - alreadyRecv);

                return (
                  <div key={k} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-700">{k}</span>
                        {alreadyRecv > 0 && (
                          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded">
                            Đã lấy: {alreadyRecv}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400 font-bold">Cần nhận: {rem} / {v as number}</span>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-[9px] font-bold text-gray-400 uppercase block mb-1 ml-1">Số lượng gửi</label>
                        <div className="w-full bg-gray-100 border-2 border-gray-200 rounded-lg py-2 text-center font-bold text-gray-500">
                          {v as number}
                        </div>
                      </div>
                      <div className="flex-1">
                        <label className="text-[9px] font-bold text-gray-400 uppercase block mb-1 ml-1">Lấy thực tế</label>
                        <input 
                          type="number"
                          inputMode="numeric"
                          value={partialReceiveItems[k] ?? ""}
                          placeholder="0"
                          onChange={(e) => {
                            setPartialReceiveItems({ ...partialReceiveItems, [k]: e.target.value });
                          }}
                          className="w-full bg-white border-2 border-blue-100 rounded-lg py-2 text-center font-bold text-blue-600 focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-400 italic text-center">
              Số lượng chưa nhận sẽ tiếp tục hiển thị trong danh sách chờ.
            </p>
          </div>
        )}
      </Modal>

      <Modal 
        isOpen={modal?.type === 'confirmFullReceive'} 
        onClose={() => setModal(null)}
        title="Xác nhận nhận đủ hàng"
        footer={
          <>
            <button onClick={() => setModal(null)} className="flex-1 py-3 bg-white border text-gray-600 font-bold rounded-xl">Huỷ</button>
            <button 
              onClick={modal?.onOk}
              className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200"
            >
              Xác nhận đủ
            </button>
          </>
        }
      >
        {modal?.send && (
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
              <p className="text-xs font-bold text-blue-800 uppercase tracking-wider">Nhận hàng từ</p>
              <h4 className="text-lg font-bold text-blue-900 mt-1">{modal.send.workshop}</h4>
              <p className="text-xs text-blue-600 mt-0.5">Lần {modal.send.batch} · Giao lúc {modal.send.deliveredAt}</p>
            </div>
            
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500 px-1">DANH SÁCH HÀNG CẦN NHẬN:</p>
              <div className="bg-gray-50 rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="text-left p-3 text-[10px] font-bold text-gray-400 uppercase">Loại hàng</th>
                      <th className="text-center p-3 text-[10px] font-bold text-gray-400 uppercase">Số lượng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {Object.entries(modal.items).map(([k, v]) => (
                      <tr key={k}>
                        <td className="p-3 font-bold text-gray-700">{k}</td>
                        <td className="p-3 text-center font-black text-blue-600">{v as number}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-800 font-medium leading-relaxed">
                Vui lòng kiểm tra kỹ số lượng thực tế tại xưởng trước khi xác nhận. Hành động này sẽ đánh dấu lượt gửi này là <strong>Hoàn tất</strong>.
              </p>
            </div>
          </div>
        )}
      </Modal>

      <Modal 
        isOpen={modal?.type === 'delivery'} 
        onClose={() => setModal(null)}
        title="Xác nhận giao hàng"
        footer={
          <>
            <button onClick={() => setModal(null)} className="flex-1 py-3 bg-white border text-gray-600 font-bold rounded-xl">Huỷ</button>
            <button 
              onClick={() => {
                if (!deliveringSend) return;
                const origTotal = sumValues(deliveringSend.items);
                const actualTotal = sumValues(deliveryActual);
                if (origTotal !== actualTotal && !deliveryNote) {
                  showToast("Vui lòng chọn lý do lệch");
                  return;
                }
                
                const at = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
                updateData(prev => {
                  const newSends = ticketA.sends.map(s => s.id === deliveringSend.id ? {
                    ...s,
                    delivered: true,
                    actualItems: { ...deliveryActual },
                    deliveryNote: deliveryNote,
                    deliveredBy: "Bạn",
                    deliveredAt: at
                  } : s);

                  let nextData = {
                    ...prev,
                    ticketsA: {
                      ...prev.ticketsA,
                      [currentDate]: { ...ticketA, sends: newSends }
                    }
                  };

                  // If it's from B, sync back to B
                  if (deliveringSend.source === 'B' && deliveringSend.sourceBatch) {
                    const bBatchNum = deliveringSend.sourceBatch;
                    const dest = deliveringSend.workshop;
                    const ticketB = prev.ticketsB[currentDate];
                    if (ticketB) {
                      const newItemsB = ticketB.items.map(item => {
                        if (item.batch === bBatchNum) {
                          const alloc = item.realAllocation || item.allocation;
                          const dIdx = destinations.indexOf(dest);
                          if (alloc[dIdx] > 0) {
                            return {
                              ...item,
                              deliveries: {
                                ...item.deliveries,
                                [dest]: { delivered: true, deliveredAt: at, deliveredBy: "Bạn" }
                              }
                            };
                          }
                        }
                        return item;
                      });
                      nextData.ticketsB[currentDate] = { ...ticketB, items: newItemsB };
                    }
                  }

                  return nextData;
                });
                setModal(null);
                showToast("Đã xác nhận giao hàng");
              }}
              className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200"
            >
              Xác nhận
            </button>
          </>
        }
      >
        {deliveringSend && (
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
              <p className="text-xs font-bold text-blue-800 uppercase tracking-wider">Thông tin lượt gửi</p>
              <h4 className="text-lg font-bold text-blue-900 mt-1">{deliveringSend.workshop}</h4>
              <p className="text-xs text-blue-600 mt-0.5">Lần {deliveringSend.batch} · {deliveringSend.source === 'B' ? 'Từ kho B' : 'Từ kho A'}</p>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase px-1">
                <span>Loại hàng</span>
                <div className="flex gap-8">
                  <span className="w-12 text-center">QL Ghi</span>
                  <span className="w-16 text-center">Thực tế</span>
                </div>
              </div>
              {Object.entries(deliveringSend.items).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between p-2 bg-gray-50 rounded-xl">
                  <span className="text-sm font-bold text-gray-700">{k}</span>
                  <div className="flex items-center gap-4">
                    <span className="w-12 text-center font-bold text-gray-400">{v as number}</span>
                    <input 
                      type="number"
                      value={deliveryActual[k] ?? (v as number)}
                      onChange={(e) => setDeliveryActual({ ...deliveryActual, [k]: parseInt(e.target.value) || 0 })}
                      className="w-16 bg-white border-2 border-blue-100 rounded-lg py-1.5 text-center font-bold text-blue-600 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>

            {Object.values(deliveringSend.items).reduce((a: number, b) => a + (b as number), 0) !== Object.values(deliveryActual).reduce((a: number, b) => a + (b as number), 0) && (
              <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                <label className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Lý do lệch số lượng
                </label>
                <select 
                  value={deliveryNote}
                  onChange={(e) => setDeliveryNote(e.target.value)}
                  className="w-full bg-amber-50 border-2 border-amber-200 rounded-xl p-3 text-sm font-medium text-amber-900 focus:outline-none"
                >
                  <option value="">-- Chọn lý do --</option>
                  <option value="Kho A không đủ hàng">Kho A không đủ hàng</option>
                  <option value="Hàng lỗi không gửi được">Hàng lỗi không gửi được</option>
                  <option value="Quản lý ghi nhầm">Quản lý ghi nhầm</option>
                  <option value="Lý do khác">Lý do khác</option>
                </select>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={modal?.type === 'editSendWorkshop'}
        onClose={() => setModal(null)}
        title="Sửa xưởng/đích nhận hàng"
        footer={
          <>
            <button onClick={() => setModal(null)} className="flex-1 py-3 bg-white border text-gray-600 font-bold rounded-xl">Huỷ</button>
            <button 
              onClick={() => {
                if (!editingSendWorkshop) return;
                updateData(prev => {
                  const ticket = prev.ticketsA[currentDate];
                  if (!ticket) return prev;
                  const newSends = ticket.sends.map(s => s.id === editingSendWorkshop.id ? editingSendWorkshop : s);
                  return {
                    ...prev,
                    ticketsA: {
                      ...prev.ticketsA,
                      [currentDate]: { ...ticket, sends: newSends }
                    }
                  };
                });
                setModal(null);
                showToast("Đã cập nhật xưởng nhận hàng");
              }}
              className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200"
            >
              Lưu thay đổi
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500 font-medium">Chọn xưởng hoặc đích đến chính xác cho lượt gửi này:</p>
          <div className="grid grid-cols-2 gap-2">
            {destinations.map((dest, idx) => (
              <button
                key={dest}
                onClick={() => setEditingSendWorkshop(prev => prev ? { ...prev, workshop: dest, workshopIdx: idx } : null)}
                className={cn(
                  "p-3 rounded-xl border-2 text-xs font-bold transition-all text-center",
                  editingSendWorkshop?.workshop === dest 
                    ? "border-blue-500 bg-blue-50 text-blue-700" 
                    : "border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200"
                )}
              >
                {dest}
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={modal?.type === 'confirmDelivery'}
        onClose={() => setModal(null)}
        title={`Xác nhận giao hàng - ${deliveryConfirmDest?.name}`}
        footer={
          <>
            <button onClick={() => setModal(null)} className="flex-1 py-3 bg-white border text-gray-600 font-bold rounded-xl">Huỷ</button>
            <button 
              onClick={() => {
                if (!deliveryConfirmDest) return;
                const at = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
                const { name: dest, idx: dIdx, bNum } = deliveryConfirmDest;

                updateData(prev => {
                  const currentTicketB = prev.ticketsB[currentDate] || ticketB;
                  const currentTicketA = prev.ticketsA[currentDate] || ticketA;

                  // 1. Update Ticket B items
                  const nextItemsB = currentTicketB.items.map(item => {
                    if (item.batch === bNum) {
                      const confirmedItem = deliveryConfirmItems.find(ci => ci.sku === item.sku);
                      if (confirmedItem) {
                        const newDeliveries = { ...(item.deliveries || {}) };
                        newDeliveries[dest] = {
                          delivered: true,
                          deliveredAt: at,
                          qty: confirmedItem.qty
                        };
                        return { ...item, deliveries: newDeliveries };
                      }
                    }
                    return item;
                  });

                  let nextData = {
                    ...prev,
                    ticketsB: {
                      ...prev.ticketsB,
                      [currentDate]: { ...currentTicketB, items: nextItemsB }
                    }
                  };

                  // 2. Update Send in Ticket A
                  const targetSend = currentTicketA.sends.find(s => 
                    s.source === 'B' && 
                    s.sourceBatch === bNum && 
                    (s.workshopIdx === dIdx || s.workshop === dest)
                  );

                  if (targetSend) {
                    const totalQty = deliveryConfirmItems.reduce((s, i) => s + i.qty, 0);
                    const newSendsA = currentTicketA.sends.map(s => s.id === targetSend.id ? {
                      ...s,
                      delivered: true,
                      deliveredAt: at,
                      deliveredBy: "Bạn",
                      workshop: dest,
                      workshopIdx: dIdx,
                      items: aggregateByCategory(deliveryConfirmItems),
                      bSourceItems: deliveryConfirmItems.map(i => ({ sku: i.sku, name: i.name, qty: i.qty }))
                    } : s);
                    nextData.ticketsA[currentDate] = { ...currentTicketA, sends: newSendsA };
                  }

                  return nextData;
                });
                setModal(null);
                showToast(`Đã xác nhận giao hàng cho ${dest}`);
              }}
              className="flex-1 py-3 bg-amber-600 text-white font-bold rounded-xl shadow-lg shadow-amber-200"
            >
              Xác nhận giao
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500 font-medium">Kiểm tra và điều chỉnh số lượng thực tế giao cho xưởng:</p>
          <div className="space-y-3">
            {deliveryConfirmItems.map((item, idx) => (
              <div key={item.sku} className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100">
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-gray-800">{item.name}</h4>
                  <p className="text-[10px] text-gray-400 font-bold uppercase">SKU: {item.sku}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-gray-400 uppercase">Dự kiến</p>
                    <p className="text-xs font-black text-gray-400">{deliveryConfirmItems[idx].qty}</p>
                  </div>
                  <div className="w-px h-8 bg-gray-200" />
                  <div className="text-center">
                    <p className="text-[9px] font-bold text-amber-600 uppercase">Thực giao</p>
                    <input 
                      type="number"
                      value={item.qty}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        const next = [...deliveryConfirmItems];
                        next[idx] = { ...next[idx], qty: val };
                        setDeliveryConfirmItems(next);
                      }}
                      className="w-16 bg-white border-2 border-amber-200 rounded-lg py-1 text-center text-sm font-black text-amber-700 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 flex justify-between items-center">
            <span className="text-xs font-bold text-amber-800 uppercase">Tổng cộng</span>
            <span className="text-lg font-black text-amber-700">
              {deliveryConfirmItems.reduce((s, i) => s + i.qty, 0)}
            </span>
          </div>
        </div>
      </Modal>
      <Modal 
        isOpen={modal?.type === 'editActual'} 
        onClose={() => setModal(null)}
        title="Nhập số thực tế"
        footer={
          <>
            <button onClick={() => setModal(null)} className="flex-1 py-3 bg-white border text-gray-600 font-bold rounded-xl">Huỷ</button>
            <button 
              onClick={() => {
                const item = ticketB.items.find(i => i.sku === editingItem);
                if (!item) return;
                if (editActual !== item.requested && !editNote) {
                  showToast("Vui lòng chọn lý do lệch");
                  return;
                }
                const nextItems = ticketB.items.map(i => i.sku === editingItem ? { ...i, actual: editActual, note: editNote } : i);
                
                updateData(prev => {
                  const updatedB = {
                    ...ticketB,
                    items: nextItems
                  };
                  const bBatchNum = item.batch;
                  const bItems = nextItems.filter(i => i.batch === bBatchNum);
                  const step1Done = bItems.every(i => i.actual !== null);
                  const needsRealloc = bItems.some(i => i.actual !== null && i.actual !== i.requested);
                  const reallocDone = bItems.filter(i => i.actual !== null && i.actual !== i.requested).every(i => i.realAllocation !== null);

                  let nextData = {
                    ...prev,
                    ticketsB: {
                      ...prev.ticketsB,
                      [currentDate]: updatedB
                    }
                  };

                  if (step1Done && (!needsRealloc || reallocDone)) {
                    // Sync to A
                    const ticketA = prev.ticketsA[currentDate];
                    if (ticketA) {
                      let newSendsA = [...ticketA.sends];
                      const at = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
                      const existingSourceBatch = ticketA.sends.find(s => s.source === 'B' && s.sourceBatch === bBatchNum);
                      const batchToUse = existingSourceBatch ? existingSourceBatch.batch : (Math.max(0, ...ticketA.sends.map(s => s.batch || 1)) + 1);

                      destinations.forEach((dest, dIdx) => {
                        const itemsForDest: { sku: string, name: string, qty: number }[] = [];
                        bItems.forEach(bi => {
                          const alloc = bi.realAllocation || bi.allocation;
                          if (alloc[dIdx] > 0) itemsForDest.push({ sku: bi.sku, name: bi.name, qty: alloc[dIdx] });
                        });
                        if (itemsForDest.length === 0) return;
                        const totalQty = itemsForDest.reduce((s, i) => s + i.qty, 0);
                        const existingSend = newSendsA.find(s => 
                          s.source === 'B' && 
                          s.sourceBatch === bBatchNum && 
                          (s.workshopIdx === dIdx || s.workshop === dest)
                        );
                        if (!existingSend) {
                          const nextId = Math.max(0, ...newSendsA.map(s => s.id)) + 1;
                          newSendsA.push({
                            id: nextId, batch: batchToUse, source: 'B', workshop: dest, time: at,
                            items: aggregateByCategory(itemsForDest), delivered: false,
                            bSourceItems: itemsForDest.map(i => ({ sku: i.sku, name: i.name, qty: i.qty })),
                            sourceBatch: bBatchNum,
                            workshopIdx: dIdx
                          });
                        } else if (!existingSend.delivered) {
                          existingSend.items = aggregateByCategory(itemsForDest);
                          existingSend.bSourceItems = itemsForDest.map(i => ({ sku: i.sku, name: i.name, qty: i.qty }));
                          existingSend.workshop = dest;
                          existingSend.workshopIdx = dIdx;
                        }
                      });
                      nextData.ticketsA[currentDate] = { ...ticketA, sends: newSendsA };
                    }
                  }
                  return nextData;
                });
                setModal(null);
                showToast("Đã cập nhật số thực tế");
              }}
              className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200"
            >
              Xác nhận
            </button>
          </>
        }
      >
        {editingItem && (() => {
          const item = ticketB.items.find(i => i.sku === editingItem);
          if (!item) return null;
          const isLech = editActual !== item.requested;
          return (
            <div className="space-y-6">
              <div className="text-center">
                <h4 className="font-bold text-lg text-gray-900">{item.name}</h4>
                <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider font-bold">{item.category}</p>
              </div>
              
              <div className="flex items-center justify-center gap-8">
                <div className="text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Yêu cầu</p>
                  <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center text-2xl font-black text-gray-400 border-2 border-gray-100">
                    {item.requested}
                  </div>
                </div>
                <div className="text-gray-200">
                  <ChevronRight className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">Thực tế</p>
                  <input 
                    type="number"
                    value={editActual}
                    onChange={(e) => setEditActual(parseInt(e.target.value) || 0)}
                    className="w-20 h-20 bg-blue-50 border-4 border-blue-200 rounded-2xl text-center text-3xl font-black text-blue-700 focus:border-blue-500 focus:outline-none shadow-inner"
                    autoFocus
                  />
                </div>
              </div>

              {isLech && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                  <label className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Lý do lệch số lượng ({editActual < item.requested ? 'Thiếu' : 'Thừa'})
                  </label>
                  <select 
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    className="w-full bg-amber-50 border-2 border-amber-200 rounded-xl p-3 text-sm font-medium text-amber-900 focus:outline-none"
                  >
                    <option value="">-- Chọn lý do --</option>
                    <option value="Kho B hết hàng">Kho B hết hàng</option>
                    <option value="Hàng lỗi không lấy được">Hàng lỗi không lấy được</option>
                    <option value="Không tìm thấy ở vị trí">Không tìm thấy ở vị trí</option>
                    <option value="Phát sinh đơn mới">Phát sinh đơn mới</option>
                    <option value="Lý do khác">Lý do khác</option>
                  </select>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      <Modal 
        isOpen={modal?.type === 'productForm'} 
        onClose={() => setModal(null)}
        title={productForm?.mode === 'edit' ? "Sửa sản phẩm" : `Thêm vào Lần ${productForm?.batch}`}
        footer={
          <>
            <button onClick={() => setModal(null)} className="flex-1 py-3 bg-white border text-gray-600 font-bold rounded-xl">Huỷ</button>
            <button 
              onClick={() => {
                const total = formProductAlloc.reduce((a, b) => a + b, 0);
                if (total === 0) {
                  showToast("Vui lòng nhập số lượng phân chia");
                  return;
                }
                
                if (productForm?.mode === 'edit') {
                  updateData(prev => ({
                    ticketsB: {
                      ...prev.ticketsB,
                      [currentDate]: {
                        ...ticketB,
                        items: ticketB.items.map(i => i.sku === productForm.sku ? {
                          ...i,
                          allocation: [...formProductAlloc],
                          requested: total
                        } : i)
                      }
                    }
                  }));
                  showToast("Đã cập nhật sản phẩm");
                } else {
                  const product = state.products.find(p => p.sku === formProductSku);
                  if (!product) {
                    showToast("Vui lòng chọn sản phẩm");
                    return;
                  }
                  const newItem: TicketBItem = {
                    sku: product.sku,
                    batch: productForm?.batch || 1,
                    name: product.name,
                    category: product.category,
                    requested: total,
                    allocation: [...formProductAlloc],
                    realAllocation: null,
                    actual: null,
                    photoTaken: false,
                    note: "",
                    deliveries: {}
                  };
                  // Initialize deliveries
                  destinations.forEach((d, i) => {
                    if (formProductAlloc[i] > 0) {
                      newItem.deliveries[d] = { delivered: false, sendRefId: null };
                    }
                  });
                  
                  updateData(prev => ({
                    ticketsB: {
                      ...prev.ticketsB,
                      [currentDate]: {
                        ...ticketB,
                        items: [...ticketB.items, newItem]
                      }
                    }
                  }));
                  showToast("Đã thêm sản phẩm");
                }
                setModal(null);
              }}
              className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200"
            >
              {productForm?.mode === 'edit' ? 'Cập nhật' : 'Thêm mới'}
            </button>
          </>
        }
      >
        <div className="space-y-6">
          {productForm?.mode === 'add' && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Tìm sản phẩm</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Gõ tên mẫu để tìm..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm focus:bg-white focus:border-blue-500 focus:outline-none transition-all"
                />
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-xl divide-y bg-white shadow-sm mt-2">
                {(() => {
                  const filtered = state.products.filter(p => 
                    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                    p.sku.toLowerCase().includes(productSearch.toLowerCase())
                  );
                  
                  if (filtered.length === 0) {
                    return (
                      <div className="p-8 text-center">
                        <Package className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                        <p className="text-xs text-gray-400 font-medium">
                          {productSearch ? "Không tìm thấy sản phẩm nào" : "Chưa có sản phẩm nào trong kho"}
                        </p>
                      </div>
                    );
                  }

                  // Show all if no search, or filtered results
                  const displayList = productSearch ? filtered : filtered.slice(0, 10);

                  return (
                    <>
                      {!productSearch && filtered.length > 10 && (
                        <div className="px-4 py-2 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b">
                          Top 10 sản phẩm gần đây
                        </div>
                      )}
                      {displayList.map(p => (
                        <button 
                          key={p.sku}
                          onClick={() => {
                            setFormProductSku(p.sku);
                            setProductSearch("");
                          }}
                          className={cn(
                            "w-full text-left px-4 py-4 text-xs font-medium hover:bg-blue-50 transition-colors flex items-center justify-between group",
                            formProductSku === p.sku && "bg-blue-50 text-blue-700 font-bold"
                          )}
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm text-gray-900 group-hover:text-blue-700">{p.name}</span>
                            <span className="text-[10px] text-gray-400 uppercase">{p.category} · {p.sku}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400" />
                        </button>
                      ))}
                    </>
                  );
                })()}
              </div>
              {formProductSku && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold text-blue-900">
                      {state.products.find(p => p.sku === formProductSku)?.name}
                    </span>
                  </div>
                  <button onClick={() => setFormProductSku("")} className="text-blue-400 hover:text-blue-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Phân chia đích đến</label>
            <div className="grid grid-cols-2 gap-3">
              {destinations.map((d, i) => (
                <div key={d} className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-600">{d}</span>
                  <input 
                    type="number" 
                    placeholder="0"
                    value={formProductAlloc[i] || ""}
                    onChange={(e) => {
                      const v = Math.max(0, parseInt(e.target.value) || 0);
                      const na = [...formProductAlloc];
                      na[i] = v;
                      setFormProductAlloc(na);
                    }}
                    className="w-12 bg-white border rounded-lg py-1 text-center font-bold text-blue-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 p-4 bg-blue-600 rounded-2xl flex items-center justify-between text-white shadow-lg shadow-blue-100">
              <span className="text-xs font-bold uppercase tracking-widest opacity-80">Tổng cộng</span>
              <span className="text-2xl font-black">{formProductAlloc.reduce((a: number, b) => a + b, 0)}</span>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={modal?.type === 'receiveHistory'}
        onClose={() => setModal(null)}
        title="Lịch sử nhận hàng"
        footer={<button onClick={() => setModal(null)} className="w-full py-3 bg-gray-100 text-gray-600 font-bold rounded-xl">Đóng</button>}
      >
        {historySend && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded-xl border dark:border-slate-800">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Xưởng</p>
              <h4 className="text-lg font-bold text-gray-900 dark:text-white">{historySend.workshop}</h4>
              <p className="text-xs text-gray-500 mt-0.5">Lần {historySend.batch} · Tổng giao: {sumValues(historySend.actualItems || historySend.items)}</p>
            </div>
            
            <div className="space-y-3">
              {(ticketA.receives[historySend.workshop] || [])
                .filter(r => r.forSendId === historySend.id)
                .sort((a, b) => b.id - a.id)
                .map((rec, idx) => (
                  <div key={rec.id} className="p-3 bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-xl shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Lượt nhận #{rec.id}</span>
                        {idx === 0 && (
                          <button 
                            onClick={() => {
                              setModal({
                                type: 'confirm',
                                title: "Hoàn tác lượt này?",
                                msg: `Bạn muốn xoá lượt nhận hàng #${rec.id} của xưởng ${historySend.workshop}?`,
                                onOk: () => {
                                  undoReceive(historySend);
                                  setModal(null);
                                }
                              });
                            }}
                            className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="Xoá lượt này"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400 dark:text-slate-500">{rec.time}</span>
                    </div>
                    <div className="space-y-1">
                      {Object.entries(rec.items).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs">
                          <span className="text-gray-600 dark:text-slate-400">{k}</span>
                          <span className="font-bold text-gray-900 dark:text-white">{v}</span>
                        </div>
                      ))}
                      {rec.errors && Object.entries(rec.errors).length > 0 && Object.entries(rec.errors).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs">
                          <span className="text-red-500">Lỗi: {k}</span>
                          <span className="font-bold text-red-600">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              {(ticketA.receives[historySend.workshop] || []).filter(r => r.forSendId === historySend.id).length === 0 && (
                <div className="text-center py-6 text-gray-400 text-xs">Chưa có dữ liệu nhận hàng</div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal 
        isOpen={modal?.type === 'confirm'} 
        onClose={() => setModal(null)}
        title={modal?.title || "Xác nhận"}
        footer={
          <>
            <button onClick={() => setModal(null)} className="flex-1 py-3 bg-white border text-gray-600 font-bold rounded-xl">Huỷ</button>
            <button 
              onClick={modal?.onOk}
              className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200"
            >
              Đồng ý
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600 leading-relaxed text-center py-4">
          {modal?.msg}
        </p>
      </Modal>
    </div>
  );
}
