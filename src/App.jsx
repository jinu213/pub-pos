import React, { useState, useEffect, useMemo } from 'react';
import { 
  Clock, Users, Utensils, Plus, Minus, X, Check, 
  ArrowRight, AlertCircle, Settings, Trash2, Wifi, 
  ChefHat, LayoutDashboard, CheckCircle2, ListOrdered
} from 'lucide-react';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";

// --- 1. Firebase 설정 ---
const firebaseConfig = {
  apiKey: "AIzaSyAnQxnCowRJCcV9RVhqDadqAj9NX_gvSXc",
  authDomain: "infosys-pos.firebaseapp.com",
  projectId: "infosys-pos",
  storageBucket: "infosys-pos.firebasestorage.app",
  messagingSenderId: "1088430025984",
  appId: "1:1088430025984:web:7d152276875250d41717e5",
  measurementId: "G-42VDDVZ90W"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const SYSTEM_CONFIG = {
  TOTAL_TABLES: 16,
  DEFAULT_TIME_LIMIT_MIN: 120, 
  MERGE_BONUS_MIN: 30,         
};

const INITIAL_MENU = [
  { id: 'm1', name: '참이슬', price: 5000 },
  { id: 'm2', name: '카스', price: 5000 },
  { id: 'm3', name: '모듬어묵탕', price: 18000 },
  { id: 'm4', name: '순살 가라아게', price: 20000 },
  { id: 'm5', name: '과일화채', price: 15000 },
];

const INITIAL_TABLES = Array.from({ length: SYSTEM_CONFIG.TOTAL_TABLES }, (_, i) => ({
  id: i + 1,
  label: `테이블 ${i + 1}`,
  status: 'empty', 
  orders: [], 
  startTime: null, 
  timeLimit: SYSTEM_CONFIG.DEFAULT_TIME_LIMIT_MIN,
}));

export default function App() {
  const [viewMode, setViewMode] = useState('pos');
  const [tables, setTables] = useState([]);
  const [menuCatalog, setMenuCatalog] = useState([]);
  const [isDbReady, setIsDbReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [selectedTableId, setSelectedTableId] = useState(null);
  
  const [isMergeMode, setIsMergeMode] = useState(false);
  const [isMenuConfigOpen, setIsMenuConfigOpen] = useState(false);
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

  // Firestore 실시간 동기화
  useEffect(() => {
    const docRef = doc(db, "pos_data", "main_status");
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTables(data.tables || []);
        setMenuCatalog(data.menuCatalog || []);
        setIsDbReady(true);
      } else {
        setDoc(docRef, { tables: INITIAL_TABLES, menuCatalog: INITIAL_MENU });
      }
    });
    return () => unsubscribe();
  }, []);

  const updateDB = async (newTables, newMenuCatalog) => {
    await setDoc(doc(db, "pos_data", "main_status"), {
      tables: newTables || tables,
      menuCatalog: newMenuCatalog || menuCatalog
    }, { merge: true });
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ESC 단축키 제어
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (dialogConfig.isOpen) setDialogConfig(prev => ({...prev, isOpen: false}));
        else if (isMergeMode) setIsMergeMode(false);
        else if (isMenuConfigOpen) setIsMenuConfigOpen(false);
        else if (selectedTableId !== null) setSelectedTableId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogConfig.isOpen, isMergeMode, isMenuConfigOpen, selectedTableId]);

  // 주방 데이터 집계 (개별 카드 및 메뉴별 총량)
  const kitchenData = useMemo(() => {
    const cards = [];
    const summary = {};

    tables.forEach(table => {
      table.orders.forEach(order => {
        const remaining = order.quantity - (order.prepared || 0);
        if (remaining > 0) {
          summary[order.name] = (summary[order.name] || 0) + remaining;
          for (let i = 0; i < remaining; i++) {
            cards.push({
              tableId: table.id,
              tableLabel: table.label,
              orderId: order.id,
              orderName: order.name,
              startTime: table.startTime,
              uniqueKey: `${table.id}-${order.id}-${i}`
            });
          }
        }
      });
    });
    return { 
      cards: cards.sort((a, b) => a.startTime - b.startTime), 
      summary: Object.entries(summary).sort((a, b) => b[1] - a[1]) 
    };
  }, [tables]);

  const completeKitchenOrder = (tableId, orderId) => {
    const newTables = tables.map(t => {
      if (t.id === tableId) {
        const newOrders = t.orders.map(o => o.id === orderId ? { ...o, prepared: (o.prepared || 0) + 1 } : o);
        return { ...t, orders: newOrders };
      }
      return t;
    });
    updateDB(newTables, null);
  };

  const processOrderAddition = (menu) => {
    const newTables = tables.map(t => {
      if (t.id === selectedTableId) {
        const exist = t.orders.find(o => o.id === menu.id);
        const updated = exist 
          ? t.orders.map(o => o.id === menu.id ? { ...o, quantity: o.quantity + 1 } : o)
          : [...t.orders, { ...menu, quantity: 1, prepared: 0 }];
        const isFirst = t.startTime === null;
        return { ...t, orders: updated, status: isFirst ? 'occupied' : t.status, startTime: isFirst ? Date.now() : t.startTime };
      }
      return t;
    });
    updateDB(newTables, null);
  };

  const processOrderRemoval = (menuId) => {
    const newTables = tables.map(t => {
      if (t.id === selectedTableId) {
        const exist = t.orders.find(o => o.id === menuId);
        if (!exist) return t;
        const updated = exist.quantity > 1
          ? t.orders.map(o => o.id === menuId ? { ...o, quantity: o.quantity - 1, prepared: Math.min(o.prepared || 0, o.quantity - 1) } : o)
          : t.orders.filter(o => o.id !== menuId);
        return { ...t, orders: updated };
      }
      return t;
    });
    updateDB(newTables, null);
  };

  // --- 합석 실행 로직 ---
  const executeMerge = (sourceId) => {
    const newTables = [...tables];
    const targetIdx = newTables.findIndex(t => t.id === selectedTableId);
    const sourceIdx = newTables.findIndex(t => t.id === sourceId);
    
    const mergedOrders = [...newTables[targetIdx].orders];
    newTables[sourceIdx].orders.forEach(sourceItem => {
      const existingIdx = mergedOrders.findIndex(item => item.id === sourceItem.id);
      if (existingIdx !== -1) {
        mergedOrders[existingIdx] = { 
          ...mergedOrders[existingIdx], 
          quantity: mergedOrders[existingIdx].quantity + sourceItem.quantity, 
          prepared: (mergedOrders[existingIdx].prepared || 0) + (sourceItem.prepared || 0) 
        };
      } else { 
        mergedOrders.push({ ...sourceItem }); 
      }
    });

    newTables[targetIdx] = { 
      ...newTables[targetIdx], 
      orders: mergedOrders, 
      timeLimit: newTables[targetIdx].timeLimit + SYSTEM_CONFIG.MERGE_BONUS_MIN, 
      label: `${newTables[targetIdx].label} (+${sourceId}번)` 
    };

    newTables[sourceIdx] = { 
      ...newTables[sourceIdx], 
      status: 'empty', 
      orders: [], 
      startTime: null, 
      timeLimit: SYSTEM_CONFIG.DEFAULT_TIME_LIMIT_MIN, 
      label: `테이블 ${sourceId}` 
    };

    updateDB(newTables, null);
    setIsMergeMode(false);
  };

  const formatCurrency = (val) => Number(val).toLocaleString('ko-KR') + '원';
  const calculateTotal = (orders) => orders.reduce((sum, o) => sum + (o.price * o.quantity), 0);
  const computeTime = (start, limit, current) => {
    if (!start) return { remaining: '00:00:00', isOver: false };
    const elapMs = current - start;
    const remMs = (limit * 60 * 1000) - elapMs;
    const isOver = remMs < 0;
    const absRem = Math.abs(remMs);
    const pad = (n) => String(n).padStart(2, '0');
    return {
      remaining: `${isOver ? '+' : ''}${pad(Math.floor(absRem / 3600000))}:${pad(Math.floor((absRem % 3600000) / 60000))}:${pad(Math.floor((absRem % 60000) / 1000))}`,
      isOver
    };
  };

  // 합석 가능한 테이블 필터링 (현재 선택된 테이블 제외, 사용 중인 테이블만)
  const availableMergeTargets = useMemo(() => tables.filter(t => t.status === 'occupied' && t.id !== selectedTableId), [tables, selectedTableId]);

  if (!isDbReady) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white gap-4">
      <Wifi className="h-10 w-10 text-indigo-500 animate-pulse" />
      <h2 className="text-xl font-bold tracking-tighter">정보시스템학과 POS 연결 중...</h2>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      <nav className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-6 py-4 sticky top-0 z-30 shadow-2xl">
        <div className="max-w-[1800px] mx-auto flex justify-between items-center">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-black text-white flex items-center gap-2 tracking-tighter cursor-default">
              <Utensils className="h-7 w-7 text-indigo-500" /> INFOSYS POS
            </h1>
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner">
              <button onClick={() => setViewMode('pos')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 hover:scale-105 active:scale-95 ${viewMode === 'pos' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-200'}`}>
                <LayoutDashboard className="h-4 w-4" /> 홀 관리
              </button>
              <button onClick={() => setViewMode('kitchen')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 hover:scale-105 active:scale-95 ${viewMode === 'kitchen' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-200'}`}>
                <ChefHat className="h-4 w-4" /> 주방 현황
                {kitchenData.cards.length > 0 && <span className="ml-2 bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full animate-bounce">{kitchenData.cards.length}</span>}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMenuConfigOpen(true)} className="p-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 transition-all duration-200 hover:bg-slate-700 hover:border-indigo-500 hover:text-white">
              <Settings className="h-5 w-5" />
            </button>
            <div className="text-right cursor-default"><div className="text-xl font-mono text-indigo-400 font-bold tracking-tighter">{new Date(currentTime).toLocaleTimeString('ko-KR', { hour12: false })}</div></div>
          </div>
        </div>
      </nav>

      <main className="p-6 max-w-[1800px] mx-auto">
        {viewMode === 'pos' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {tables.map(table => {
              const { remaining, isOver } = computeTime(table.startTime, table.timeLimit, currentTime);
              const isOcc = table.status === 'occupied';
              return (
                <button key={table.id} onClick={() => setSelectedTableId(table.id)} className={`group relative flex flex-col p-5 rounded-2xl border-2 transition-all duration-300 hover:scale-[1.02] active:scale-95 text-left ${!isOcc ? 'bg-slate-900/40 border-slate-800 hover:border-indigo-500/50' : 'bg-slate-900 border-indigo-600 shadow-indigo-600/10 shadow-xl hover:border-indigo-400'}`}>
                  <div className="flex justify-between items-start w-full mb-4">
                    <span className={`text-lg font-black transition-colors ${isOcc ? 'text-white' : 'text-slate-600 group-hover:text-slate-400'}`}>{table.label}</span>
                    {isOcc && <span className={`px-2 py-1 rounded text-xs font-mono font-bold ${isOver ? 'text-rose-400 bg-rose-500/10' : 'text-indigo-400 bg-indigo-500/10'}`}>{remaining}</span>}
                  </div>
                  {!isOcc ? <div className="flex-1 flex flex-col items-center justify-center py-8 opacity-20 group-hover:opacity-40 transition-opacity"><Users className="h-10 w-10 mb-2" /><span className="text-xs font-bold uppercase tracking-widest">Available</span></div> : (
                    <div className="flex-1 flex flex-col w-full">
                      <div className="space-y-1.5 mb-4 max-h-32 overflow-y-auto scrollbar-thin">
                        {table.orders.map(o => (
                          <div key={o.id} className="flex justify-between text-sm items-center py-0.5 border-b border-slate-800 last:border-0">
                            <span className="text-slate-400 font-medium truncate pr-2">{o.name}</span>
                            <span className={`font-bold transition-colors ${o.prepared >= o.quantity ? 'text-emerald-500' : 'text-white'}`}>{o.prepared || 0}/{o.quantity}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-auto pt-4 border-t border-slate-800 flex justify-between items-baseline">
                        <span className="text-[10px] text-slate-600 font-black tracking-widest">TOTAL</span>
                        <span className="text-xl font-black text-emerald-500 tracking-tighter">{formatCurrency(calculateTotal(table.orders))}</span>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8 animate-in fade-in duration-300">
            <div className="flex-1">
              <h2 className="text-xl font-black mb-6 flex items-center gap-2"><ChefHat className="h-6 w-6 text-emerald-500" /> 실시간 조리 대기열</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {kitchenData.cards.map((item) => (
                  <div key={item.uniqueKey} className="bg-slate-900 border-2 border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col transition-all duration-300 hover:border-emerald-500/40">
                    <div className="bg-slate-800/50 p-4 border-b border-slate-800 flex justify-between items-center">
                      <span className="bg-indigo-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg">TABLE {item.tableId}</span>
                      <span className="text-[10px] font-mono text-slate-500">{new Date(item.startTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="p-8 text-center flex-1 flex flex-col justify-center">
                      <div className="text-2xl font-black text-white mb-8 tracking-tight leading-tight">{item.orderName}</div>
                      <button onClick={() => completeKitchenOrder(item.tableId, item.orderId)} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-2xl font-black text-xl shadow-lg shadow-emerald-900/20 transition-all duration-200 hover:scale-[1.03] active:scale-95 flex items-center justify-center gap-2">
                        <Check className="h-6 w-6 stroke-[3px]" /> 조리 완료
                      </button>
                    </div>
                  </div>
                ))}
                {kitchenData.cards.length === 0 && <div className="col-span-full h-[60vh] flex flex-col items-center justify-center opacity-10 border-2 border-dashed border-slate-800 rounded-3xl"><CheckCircle2 className="h-20 w-20 mb-4" /><span className="text-2xl font-black">대기 중인 주문이 없습니다</span></div>}
              </div>
            </div>
            <aside className="w-full lg:w-80 bg-slate-900/50 rounded-3xl p-8 border border-slate-800 shadow-2xl h-fit sticky top-28">
              <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2"><ListOrdered className="h-4 w-4 text-emerald-500" /> 메뉴별 합계</h3>
              <div className="space-y-4">
                {kitchenData.summary.length > 0 ? kitchenData.summary.map(([name, count]) => (
                  <div key={name} className="flex justify-between items-center bg-slate-950 p-4 rounded-2xl border border-slate-800"><span className="font-bold text-slate-300">{name}</span><span className="bg-emerald-600/10 text-emerald-500 px-3 py-1 rounded-lg font-black text-lg">{count}</span></div>
                )) : <div className="py-12 text-center text-slate-700 text-xs font-bold">집계할 주문 없음</div>}
              </div>
            </aside>
          </div>
        )}
      </main>

      {/* 🟢 모달: 홀 테이블 관리 (주문 추가/결제/합석) */}
      {selectedTableId && tables.find(t => t.id === selectedTableId) && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 z-40 animate-in fade-in duration-200">
          <div className="bg-slate-900 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-800 shadow-2xl relative">
            <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h2 className="text-3xl font-black tracking-tighter text-white">{tables.find(t => t.id === selectedTableId).label}</h2>
              <button onClick={() => setSelectedTableId(null)} className="p-3 bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 rounded-full transition-all"><X className="h-8 w-8" /></button>
            </div>
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              <div className="flex-1 p-8 overflow-y-auto bg-slate-950/50">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {menuCatalog.map(menu => (
                    <button key={menu.id} onClick={() => processOrderAddition(menu)} className="bg-slate-900 p-5 rounded-2xl border border-slate-800 text-left transition-all duration-200 hover:border-indigo-500 hover:bg-slate-800 hover:shadow-lg active:scale-95 flex flex-col justify-between h-32">
                      <div className="font-black text-slate-200 leading-tight">{menu.name}</div>
                      <div className="text-indigo-400 font-black">{formatCurrency(menu.price)}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="w-full md:w-[420px] bg-slate-900 p-8 flex flex-col border-l border-slate-800">
                <h3 className="text-[10px] font-black text-slate-600 uppercase mb-6 tracking-widest">CURRENT ORDERS</h3>
                <div className="flex-1 overflow-y-auto space-y-3 mb-8 pr-1 scrollbar-thin">
                  {tables.find(t => t.id === selectedTableId).orders.map(o => (
                    <div key={o.id} className="bg-slate-950 p-5 rounded-2xl border border-slate-800 flex justify-between items-center shadow-lg">
                      <div className="flex-1"><div className="text-sm font-black text-white">{o.name}</div><div className="text-[10px] text-slate-600 font-bold uppercase mt-1">Ready: {o.prepared || 0} / {o.quantity}</div></div>
                      <div className="flex items-center gap-3 bg-slate-900 p-2 rounded-xl border border-slate-800">
                        <button onClick={() => processOrderRemoval(o.id)} className="p-1.5 text-slate-500 hover:text-rose-500 transition-colors"><Minus className="h-5 w-5" /></button>
                        <span className="font-black text-white min-w-[24px] text-center text-lg">{o.quantity}</span>
                        <button onClick={() => processOrderAddition(o)} className="p-1.5 text-slate-500 hover:text-indigo-500 transition-colors"><Plus className="h-5 w-5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-auto border-t border-slate-800 pt-8">
                  <div className="flex justify-between items-end mb-8"><span className="text-xs font-black text-slate-600 tracking-widest">TOTAL</span><span className="text-4xl font-black text-emerald-500 tracking-tighter">{formatCurrency(calculateTotal(tables.find(t => t.id === selectedTableId).orders))}</span></div>
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setIsMergeMode(true)} disabled={tables.find(t => t.id === selectedTableId).status === 'empty'} className="bg-slate-800 hover:bg-slate-700 disabled:opacity-20 py-5 rounded-2xl font-black text-xs transition-all active:scale-95 text-white">합석 처리</button>
                    <button onClick={() => {
                        const table = tables.find(t => t.id === selectedTableId);
                        setDialogConfig({
                          isOpen: true, title: '최종 결제 및 퇴장', message: `결제 금액은 ${formatCurrency(calculateTotal(table.orders))} 입니다.\n해당 테이블을 초기화하시겠습니까?`,
                          onConfirm: () => {
                            updateDB(tables.map(t => t.id === selectedTableId ? { ...t, status: 'empty', orders: [], startTime: null, timeLimit: SYSTEM_CONFIG.DEFAULT_TIME_LIMIT_MIN, label: `테이블 ${t.id}` } : t));
                            setSelectedTableId(null);
                            setDialogConfig(prev => ({ ...prev, isOpen: false }));
                          }
                        });
                      }} className="bg-indigo-600 hover:bg-indigo-500 py-5 rounded-2xl font-black text-xs shadow-xl shadow-indigo-900/20 transition-all active:scale-95 text-white">결제 완료</button>
                  </div>
                </div>
              </div>
            </div>

            {/* 🔴 내부 모달: 합석 대상 선택 (가상 Z-index 레이어) */}
            {isMergeMode && (
              <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-xl flex flex-col p-8 z-50 animate-in fade-in duration-200">
                <div className="max-w-lg mx-auto w-full mt-10">
                  <h3 className="text-2xl font-black mb-8 flex items-center gap-3 text-white"><ArrowRight className="h-8 w-8 text-indigo-500" /> 합석할 대상 테이블 선택</h3>
                  <div className="space-y-4 max-h-[60vh] overflow-y-auto mb-10 pr-2 scrollbar-thin">
                    {availableMergeTargets.map(t => (
                      <button key={t.id} onClick={() => executeMerge(t.id)} className="w-full p-6 bg-slate-900 rounded-2xl border-2 border-slate-800 text-left flex justify-between items-center group hover:border-indigo-500 transition-all duration-200 hover:shadow-lg active:scale-95">
                        <div><div className="font-black text-slate-300 group-hover:text-white text-lg">{t.label}</div><div className="text-sm text-emerald-500 font-bold mt-1">{formatCurrency(calculateTotal(t.orders))}</div></div>
                        <Plus className="h-6 w-6 text-slate-700 group-hover:text-indigo-400" />
                      </button>
                    ))}
                    {availableMergeTargets.length === 0 && (
                      <div className="p-8 text-center text-slate-500 font-bold bg-slate-900/50 rounded-2xl border border-slate-800">현재 합석 가능한(사용 중인) 다른 테이블이 없습니다.</div>
                    )}
                  </div>
                  <button onClick={() => setIsMergeMode(false)} className="w-full py-5 bg-slate-800 hover:bg-slate-700 rounded-2xl font-black text-white transition-all active:scale-95">뒤로 가기</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 모달: 메뉴 관리 */}
      {isMenuConfigOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 z-50 animate-in zoom-in-95 duration-200">
          <div className="bg-slate-900 rounded-3xl w-full max-w-2xl border border-slate-800 p-10 flex flex-col max-h-[85vh] shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-6">
              <h2 className="text-3xl font-black flex items-center gap-3"><Settings className="h-8 w-8 text-indigo-500" /> 메뉴 관리</h2>
              <button onClick={() => setIsMenuConfigOpen(false)} className="hover:text-rose-500 transition-colors"><X className="h-8 w-8" /></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 mb-8 pr-4 scrollbar-thin">
              {menuCatalog.map(m => (
                <div key={m.id} className="flex gap-4 bg-slate-950 p-4 rounded-2xl border border-slate-800 shadow-lg group hover:border-indigo-500/50 transition-all">
                  <input type="text" value={m.name} onChange={(e) => updateDB(null, menuCatalog.map(item => item.id === m.id ? {...item, name: e.target.value} : item))} className="flex-1 bg-slate-900 border-none rounded-xl px-4 py-3 font-bold text-white focus:ring-2 ring-indigo-600 outline-none" />
                  <input type="number" value={m.price} onChange={(e) => updateDB(null, menuCatalog.map(item => item.id === m.id ? {...item, price: Number(e.target.value)} : item))} className="w-32 bg-slate-900 border-none rounded-xl px-4 py-3 font-bold text-emerald-400 text-right focus:ring-2 ring-indigo-600 outline-none" />
                  <button onClick={() => updateDB(null, menuCatalog.filter(item => item.id !== m.id))} className="p-3 text-slate-700 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"><Trash2 className="h-6 w-6" /></button>
                </div>
              ))}
            </div>
            <button onClick={() => updateDB(null, [...menuCatalog, {id: `m${Date.now()}`, name: '신규 메뉴', price: 0}])} className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-lg transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3"><Plus className="h-6 w-6" /> 메뉴 항목 추가</button>
          </div>
        </div>
      )}

      {/* 공용 다이얼로그 (확인창) */}
      {dialogConfig.isOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4 z-[60] animate-in fade-in duration-200">
          <div className="bg-slate-900 p-10 rounded-3xl w-full max-w-sm border border-slate-800 shadow-2xl text-center">
            <div className="w-20 h-20 bg-indigo-600/10 rounded-full flex items-center justify-center mx-auto mb-6"><AlertCircle className="h-10 w-10 text-indigo-500" /></div>
            <h3 className="text-2xl font-black mb-4 text-white tracking-tighter">{dialogConfig.title}</h3>
            <p className="text-slate-400 font-bold mb-10 text-sm leading-relaxed whitespace-pre-wrap">{dialogConfig.message}</p>
            <div className="flex gap-4">
              <button onClick={() => setDialogConfig({...dialogConfig, isOpen: false})} className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl text-white font-black transition-all">취소</button>
              <button onClick={dialogConfig.onConfirm} className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl text-white font-black shadow-lg transition-all">확인</button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .scrollbar-thin::-webkit-scrollbar { width: 4px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: #334155; }
        @keyframes bounce-subtle { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        .animate-bounce { animation: bounce-subtle 2s infinite; }
      `}} />
    </div>
  );
}