import React, { useState, useEffect, useMemo } from 'react';
import { 
  Clock, Users, Utensils, Plus, Minus, X, Check, 
  ArrowRight, AlertCircle, Settings, Trash2, Wifi, 
  ChefHat, LayoutDashboard, CheckCircle2, ListOrdered
} from 'lucide-react';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";

const SYSTEM_CONFIG = {
  TOTAL_TABLES: 35,
  DEFAULT_TIME_LIMIT_MIN: 120, 
  MERGE_BONUS_MIN: 30,         
};

// 2. 카테고리가 분류된 새로운 INITIAL_MENU 구성
const INITIAL_MENU = [
  // 메인 메뉴
  { id: 'm1', category: 'main', name: '삼구삼진어묵탕', price: 18000 },
  { id: 'm2', category: 'main', name: '계란 후라이온즈 스팸 주먹밥', price: 20000 },
  { id: 'm3', category: 'main', name: '치킨 롯데리야끼 자이언츠 볶음밥', price: 15000 },
  { id: 'm4', category: 'main', name: 'LGㅔ육 트윈스', price: 15000 },
  
  // 사이드 메뉴
  { id: 'm5', category: 'side', name: '감튀 하나 익을쓰', price: 15000 },
  { id: 'm6', category: 'side', name: '후르츠 황도 따다 두 손 베어스', price: 15000 },
  { id: 'm7', category: 'side', name: 'Nㅓ겟 Cㅣ킨 다이노스', price: 15000 },
  { id: 'm8', category: 'side', name: '마카로니 추가', price: 2000 },
  
  // 음료
  { id: 'm9', category: 'drink', name: '콜라', price: 2000 },
  { id: 'm10', category: 'drink', name: '사이다', price: 2000 },
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

  // 전체 테이블 초기화 로직
  const handleResetAllTables = () => {
    setDialogConfig({
      isOpen: true,
      title: '⚠️ 전체 테이블 초기화',
      message: '모든 테이블의 주문 내역, 시간, 상태가 완전히 초기화됩니다.\n이 작업은 되돌릴 수 없습니다. 진행하시겠습니까?',
      onConfirm: () => {
        updateDB(INITIAL_TABLES, null);
        setDialogConfig(prev => ({ ...prev, isOpen: false }));
        setIsMenuConfigOpen(false); // 설정 창 닫기
      }
    });
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

  // 합석 가능한 테이블 필터링
  const availableMergeTargets = useMemo(() => tables.filter(t => t.status === 'occupied' && t.id !== selectedTableId), [tables, selectedTableId]);

  if (!isDbReady) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white gap-4 p-4">
      <Wifi className="h-10 w-10 text-indigo-500 animate-pulse" />
      <h2 className="text-xl font-bold tracking-tighter text-center">정보시스템학과 POS 연결 중...</h2>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      {/* 네비게이션 */}
      <nav className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-3 sm:px-6 py-3 sm:py-4 sticky top-0 z-30 shadow-2xl">
        <div className="max-w-[1800px] mx-auto flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-3 sm:gap-8">
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2 tracking-tighter cursor-default">
              <Utensils className="h-6 w-6 sm:h-7 sm:h-7 text-indigo-500" /> 
              <span className="hidden xs:block">INFOSYS POS</span>
            </h1>
            <div className="flex bg-slate-950 p-0.5 sm:p-1 rounded-xl border border-slate-800 shadow-inner">
              <button onClick={() => setViewMode('pos')} className={`flex items-center gap-1.5 px-3 sm:px-6 py-1.5 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all duration-200 ${viewMode === 'pos' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-200'}`}>
                <LayoutDashboard className="h-3.5 w-3.5 sm:h-4 sm:h-4" /> 홀
              </button>
              <button onClick={() => setViewMode('kitchen')} className={`flex items-center gap-1.5 px-3 sm:px-6 py-1.5 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all duration-200 ${viewMode === 'kitchen' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-200'}`}>
                <ChefHat className="h-3.5 w-3.5 sm:h-4 sm:h-4" /> 주방
                {kitchenData.cards.length > 0 && <span className="ml-1 bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full animate-bounce">{kitchenData.cards.length}</span>}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <button onClick={() => setIsMenuConfigOpen(true)} className="p-2 sm:p-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 transition-all duration-200 hover:bg-slate-700 hover:border-indigo-500">
              <Settings className="h-4 w-4 sm:h-5 sm:h-5" />
            </button>
            <div className="text-right cursor-default">
              {/* 1. 실시간 시간 영역에 날짜 추가 */}
              <div className="text-xs sm:text-sm font-mono text-slate-400 font-bold tracking-tighter">
                {new Date(currentTime).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' })}
              </div>
              <div className="text-sm sm:text-xl font-mono text-indigo-400 font-bold tracking-tighter leading-none mt-1">
                {new Date(currentTime).toLocaleTimeString('ko-KR', { hour12: false })}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="p-3 sm:p-6 max-w-[1800px] mx-auto">
        {viewMode === 'pos' ? (
          <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {tables.map(table => {
              const { remaining, isOver } = computeTime(table.startTime, table.timeLimit, currentTime);
              const isOcc = table.status === 'occupied';
              return (
                <button key={table.id} onClick={() => setSelectedTableId(table.id)} className={`group relative flex flex-col p-4 sm:p-5 rounded-2xl border-2 transition-all duration-300 active:scale-95 text-left ${!isOcc ? 'bg-slate-900/40 border-slate-800 hover:border-indigo-500/30' : 'bg-slate-900 border-indigo-600 shadow-indigo-600/10 shadow-xl'}`}>
                  <div className="flex justify-between items-start w-full mb-3 sm:mb-4">
                    <span className={`text-base sm:text-lg font-black transition-colors ${isOcc ? 'text-white' : 'text-slate-600'}`}>{table.label}</span>
                    {isOcc && <span className={`px-2 py-0.5 rounded text-[10px] sm:text-xs font-mono font-bold ${isOver ? 'text-rose-400 bg-rose-500/10' : 'text-indigo-400 bg-indigo-500/10'}`}>{remaining}</span>}
                  </div>
                  {!isOcc ? <div className="flex-1 flex flex-col items-center justify-center py-6 opacity-20"><Users className="h-8 w-8 mb-2" /><span className="text-[10px] font-bold uppercase tracking-widest">Available</span></div> : (
                    <div className="flex-1 flex flex-col w-full">
                      <div className="space-y-1 mb-3 sm:mb-4 max-h-24 sm:max-h-32 overflow-y-auto scrollbar-thin">
                        {table.orders.map(o => (
                          <div key={o.id} className="flex justify-between text-xs sm:text-sm items-center py-0.5 border-b border-slate-800 last:border-0">
                            <span className="text-slate-400 font-medium truncate pr-2">{o.name}</span>
                            <span className={`font-bold transition-colors ${o.prepared >= o.quantity ? 'text-emerald-500' : 'text-white'}`}>{o.prepared || 0}/{o.quantity}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-auto pt-3 border-t border-slate-800 flex justify-between items-baseline">
                        <span className="text-[9px] text-slate-600 font-black tracking-widest">TOTAL</span>
                        <span className="text-lg sm:text-xl font-black text-emerald-500 tracking-tighter">{formatCurrency(calculateTotal(table.orders))}</span>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          /* 주방 현황 */
          <div className="flex flex-col lg:flex-row gap-4 sm:gap-8 animate-in fade-in duration-300">
            <div className="flex-1 order-2 lg:order-1">
              <h2 className="text-lg sm:text-xl font-black mb-4 sm:mb-6 flex items-center gap-2 px-1"><ChefHat className="h-5 w-5 text-emerald-500" /> 실시간 조리 대기열</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                {kitchenData.cards.map((item) => (
                  <div key={item.uniqueKey} className="bg-slate-900 border-2 border-slate-800 rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col">
                    <div className="bg-slate-800/50 p-3 sm:p-4 border-b border-slate-800 flex justify-between items-center">
                      <span className="bg-indigo-600 text-white text-[9px] sm:text-[10px] font-black px-2.5 py-1 rounded-full shadow-lg">TABLE {item.tableId}</span>
                      <span className="text-[9px] sm:text-[10px] font-mono text-slate-500">{new Date(item.startTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="p-6 sm:p-8 text-center flex-1 flex flex-col justify-center">
                      <div className="text-xl sm:text-2xl font-black text-white mb-6 sm:mb-8 tracking-tight leading-tight">{item.orderName}</div>
                      <button onClick={() => completeKitchenOrder(item.tableId, item.orderId)} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 sm:py-5 rounded-xl sm:rounded-2xl font-black text-lg sm:text-xl shadow-lg active:scale-95 flex items-center justify-center gap-2">
                        <Check className="h-5 w-5 stroke-[3px]" /> 조리 완료
                      </button>
                    </div>
                  </div>
                ))}
                {kitchenData.cards.length === 0 && <div className="col-span-full h-48 sm:h-[60vh] flex flex-col items-center justify-center opacity-10 border-2 border-dashed border-slate-800 rounded-2xl sm:rounded-3xl p-4 text-center"><CheckCircle2 className="h-12 w-12 sm:h-20 sm:h-20 mb-4" /><span className="text-lg sm:text-2xl font-black">대기 주문 없음</span></div>}
              </div>
            </div>
            <aside className="w-full lg:w-80 order-1 lg:order-2">
              <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 sm:mb-6 flex items-center gap-2 px-1"><ListOrdered className="h-4 w-4 text-emerald-500" /> 메뉴별 합계</h3>
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 sm:gap-4">
                {kitchenData.summary.length > 0 ? kitchenData.summary.map(([name, count]) => (
                  <div key={name} className="flex justify-between items-center bg-slate-900/50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-800 shadow-sm">
                    <span className="font-bold text-xs sm:text-sm text-slate-300 truncate mr-2">{name}</span>
                    <span className="bg-emerald-600/10 text-emerald-500 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-lg font-black text-base sm:text-lg">{count}</span>
                  </div>
                )) : <div className="col-span-full py-8 text-center text-slate-700 text-[10px] font-bold">비어있음</div>}
              </div>
            </aside>
          </div>
        )}
      </main>

      {/* 🟢 모달: 홀 테이블 관리 */}
      {selectedTableId && tables.find(t => t.id === selectedTableId) && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center p-0 xs:p-4 z-40 animate-in fade-in duration-200">
          <div className="bg-slate-900 rounded-none xs:rounded-3xl w-full h-full xs:h-auto max-w-5xl xs:max-h-[90vh] flex flex-col overflow-hidden border-0 xs:border border-slate-800 shadow-2xl relative">
            <div className="p-5 sm:p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tighter text-white">{tables.find(t => t.id === selectedTableId).label}</h2>
              <button onClick={() => setSelectedTableId(null)} className="p-2 sm:p-3 bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 rounded-full transition-all"><X className="h-6 w-6 sm:h-8 sm:h-8" /></button>
            </div>
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              <div className="flex-1 p-4 sm:p-8 overflow-y-auto bg-slate-950/50 space-y-8 scrollbar-thin">
                
                {/* 2. 카테고리별로 메뉴 영역 분리 */}
                {['main', 'side', 'drink'].map((catKey) => {
                  const items = menuCatalog.filter(m => (m.category || 'main') === catKey);
                  if (items.length === 0) return null;
                  
                  const catName = catKey === 'main' ? '메인 메뉴' : catKey === 'side' ? '사이드 메뉴' : '음료';
                  
                  return (
                    <div key={catKey}>
                      <h3 className="text-sm font-black text-slate-400 mb-3">{catName}</h3>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
                        {items.map(menu => (
                          <button key={menu.id} onClick={() => processOrderAddition(menu)} className="bg-slate-900 p-3 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-800 text-left hover:border-indigo-500 transition-all active:scale-95 flex flex-col justify-between h-24 sm:h-32 shadow-sm">
                            <div className="font-black text-sm sm:text-base text-slate-200 leading-tight line-clamp-2">{menu.name}</div>
                            <div className="text-indigo-400 font-black text-xs sm:text-base">{formatCurrency(menu.price)}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}

              </div>
              <div className="w-full md:w-[400px] lg:w-[420px] bg-slate-900 p-5 sm:p-8 flex flex-col border-t md:border-t-0 md:border-l border-slate-800 shadow-2xl">
                <h3 className="text-[10px] font-black text-slate-600 uppercase mb-3 sm:mb-6 tracking-widest">ORDER LIST</h3>
                <div className="flex-1 overflow-y-auto space-y-2.5 mb-4 sm:mb-8 pr-1 scrollbar-thin max-h-[150px] md:max-h-none">
                  {tables.find(t => t.id === selectedTableId).orders.map(o => (
                    <div key={o.id} className="bg-slate-950 p-3 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-800 flex justify-between items-center">
                      <div className="flex-1 mr-2">
                        <div className="text-xs sm:text-sm font-black text-white truncate">{o.name}</div>
                        <div className="text-[9px] sm:text-[10px] text-slate-600 font-bold uppercase mt-0.5">R: {o.prepared || 0} / {o.quantity}</div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 bg-slate-900 p-1 rounded-lg border border-slate-800 flex-shrink-0">
                        <button onClick={() => processOrderRemoval(o.id)} className="p-1 sm:p-1.5 text-slate-500 hover:text-rose-500"><Minus className="h-4 w-4 sm:h-5 sm:h-5" /></button>
                        <span className="font-black text-white min-w-[16px] sm:min-w-[24px] text-center text-sm sm:text-lg">{o.quantity}</span>
                        <button onClick={() => processOrderAddition(o)} className="p-1 sm:p-1.5 text-slate-500 hover:text-indigo-500"><Plus className="h-4 w-4 sm:h-5 sm:h-5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-auto border-t border-slate-800 pt-4 sm:pt-8">
                  <div className="flex justify-between items-end mb-4 sm:mb-8"><span className="text-[10px] font-black text-slate-600 tracking-widest uppercase">Total</span><span className="text-2xl sm:text-4xl font-black text-emerald-500 tracking-tighter">{formatCurrency(calculateTotal(tables.find(t => t.id === selectedTableId).orders))}</span></div>
                  <div className="grid grid-cols-2 gap-2 sm:gap-4">
                    <button onClick={() => setIsMergeMode(true)} disabled={tables.find(t => t.id === selectedTableId).status === 'empty'} className="bg-slate-800 hover:bg-slate-700 disabled:opacity-20 py-3.5 sm:py-5 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-xs transition-all active:scale-95 text-white">합석 처리</button>
                    <button onClick={() => {
                        const table = tables.find(t => t.id === selectedTableId);
                        setDialogConfig({
                          isOpen: true, title: '최종 결제', message: `${table.label} 결제: ${formatCurrency(calculateTotal(table.orders))}\n테이블을 초기화하시겠습니까?`,
                          onConfirm: () => {
                            updateDB(tables.map(t => t.id === selectedTableId ? { ...t, status: 'empty', orders: [], startTime: null, timeLimit: SYSTEM_CONFIG.DEFAULT_TIME_LIMIT_MIN, label: `테이블 ${t.id}` } : t));
                            setSelectedTableId(null);
                            setDialogConfig(prev => ({ ...prev, isOpen: false }));
                          }
                        });
                      }} className="bg-indigo-600 hover:bg-indigo-500 py-3.5 sm:py-5 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-xs shadow-xl active:scale-95 text-white">결제 완료</button>
                  </div>
                </div>
              </div>
            </div>

            {isMergeMode && (
              <div className="absolute inset-0 bg-slate-950/98 backdrop-blur-xl flex flex-col p-6 sm:p-8 z-50 animate-in fade-in duration-200 overflow-y-auto">
                <div className="max-w-lg mx-auto w-full my-auto">
                  <h3 className="text-xl sm:text-2xl font-black mb-6 sm:mb-8 flex items-center gap-3 text-white"><ArrowRight className="h-6 w-6 sm:h-8 sm:h-8 text-indigo-500" /> 합석 테이블 선택</h3>
                  <div className="space-y-3 sm:space-y-4 mb-8">
                    {availableMergeTargets.map(t => (
                      <button key={t.id} onClick={() => executeMerge(t.id)} className="w-full p-4 sm:p-6 bg-slate-900 rounded-xl sm:rounded-2xl border-2 border-slate-800 text-left flex justify-between items-center group hover:border-indigo-500 transition-all duration-200 active:scale-95">
                        <div><div className="font-black text-slate-300 text-base sm:text-lg">{t.label}</div><div className="text-[10px] sm:text-sm text-emerald-500 font-bold mt-1">{formatCurrency(calculateTotal(t.orders))}</div></div>
                        <Plus className="h-5 w-5 sm:h-6 sm:h-6 text-slate-700 group-hover:text-indigo-400" />
                      </button>
                    ))}
                    {availableMergeTargets.length === 0 && (
                      <div className="p-8 text-center text-slate-500 font-bold bg-slate-900/50 rounded-2xl border border-slate-800 text-sm">합석 가능한 다른 테이블이 없습니다.</div>
                    )}
                  </div>
                  <button onClick={() => setIsMergeMode(false)} className="w-full py-4 sm:py-5 bg-slate-800 hover:bg-slate-700 rounded-xl sm:rounded-2xl font-black text-white transition-all active:scale-95">취소</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 모달: 시스템 설정 관리 (메뉴 관리 및 전체 초기화) */}
      {isMenuConfigOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center p-0 xs:p-4 z-50 animate-in zoom-in-95 duration-200">
          <div className="bg-slate-900 rounded-none xs:rounded-3xl w-full h-full xs:h-auto max-w-3xl border-0 xs:border border-slate-800 p-6 sm:p-10 flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-6 sm:mb-8 border-b border-slate-800 pb-4 sm:pb-6">
              <h2 className="text-xl sm:text-3xl font-black flex items-center gap-3"><Settings className="h-6 w-6 sm:h-8 sm:h-8 text-indigo-500" /> 설정 및 관리</h2>
              <button onClick={() => setIsMenuConfigOpen(false)} className="hover:text-rose-500 transition-colors"><X className="h-6 w-6 sm:h-8 sm:h-8" /></button>
            </div>
            
            {/* 메뉴 관리 영역 */}
            <div className="flex-1 overflow-y-auto space-y-3 sm:space-y-4 mb-6 scrollbar-thin pr-2">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Menu Configuration</h3>
              {menuCatalog.map(m => (
                <div key={m.id} className="flex flex-wrap sm:flex-nowrap gap-3 bg-slate-950 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-800 shadow-lg transition-all items-center">
                  
                  {/* 카테고리 선택 드롭다운 추가 */}
                  <select 
                    value={m.category || 'main'} 
                    onChange={(e) => updateDB(null, menuCatalog.map(item => item.id === m.id ? {...item, category: e.target.value} : item))} 
                    className="bg-slate-800 border-none rounded-lg px-3 py-2.5 font-bold text-slate-300 text-xs sm:text-sm outline-none focus:ring-1 ring-indigo-600 appearance-none"
                  >
                    <option value="main">메인</option>
                    <option value="side">사이드</option>
                    <option value="drink">음료</option>
                  </select>

                  <input type="text" value={m.name} onChange={(e) => updateDB(null, menuCatalog.map(item => item.id === m.id ? {...item, name: e.target.value} : item))} className="flex-1 min-w-[120px] bg-slate-900 border-none rounded-lg px-3 py-2 font-bold text-white text-sm sm:text-base outline-none focus:ring-1 ring-indigo-600" />
                  
                  <input type="number" value={m.price} onChange={(e) => updateDB(null, menuCatalog.map(item => item.id === m.id ? {...item, price: Number(e.target.value)} : item))} className="w-24 sm:w-32 bg-slate-900 border-none rounded-lg px-3 py-2 font-bold text-emerald-400 text-right text-sm sm:text-base outline-none focus:ring-1 ring-indigo-600" />
                  
                  <button onClick={() => updateDB(null, menuCatalog.filter(item => item.id !== m.id))} className="p-2 sm:p-3 text-slate-700 hover:text-rose-500"><Trash2 className="h-5 w-5" /></button>
                </div>
              ))}
            </div>

            {/* 설정 하단 버튼 영역 */}
            <div className="flex flex-col gap-3">
              <button onClick={() => updateDB(null, [...menuCatalog, {id: `m${Date.now()}`, name: '신규 메뉴', price: 0, category: 'main'}])} className="w-full py-4 sm:py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl sm:rounded-2xl font-black text-sm sm:text-lg transition-all active:scale-95 flex items-center justify-center gap-2">
                <Plus className="h-5 w-5" /> 메뉴 추가하기
              </button>
              <button onClick={handleResetAllTables} className="w-full py-4 sm:py-5 bg-rose-600/10 hover:bg-rose-600 border border-rose-600/30 text-rose-500 hover:text-white rounded-xl sm:rounded-2xl font-black text-sm sm:text-lg transition-all active:scale-95 flex items-center justify-center gap-2">
                <Trash2 className="h-5 w-5" /> 모든 테이블 초기화
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 다이얼로그 */}
      {dialogConfig.isOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4 z-[60] animate-in fade-in duration-200">
          <div className="bg-slate-900 p-6 sm:p-10 rounded-2xl sm:rounded-3xl w-full max-w-sm border border-slate-800 shadow-2xl text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-indigo-600/10 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6"><AlertCircle className="h-8 w-8 sm:h-10 sm:h-10 text-indigo-500" /></div>
            <h3 className="text-xl sm:text-2xl font-black mb-3 text-white tracking-tighter">{dialogConfig.title}</h3>
            <p className="text-slate-400 font-bold mb-8 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">{dialogConfig.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setDialogConfig({...dialogConfig, isOpen: false})} className="flex-1 py-3.5 sm:py-4 bg-slate-800 hover:bg-slate-700 rounded-xl sm:rounded-2xl text-white font-black text-sm transition-all">취소</button>
              <button onClick={dialogConfig.onConfirm} className="flex-1 py-3.5 sm:py-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl sm:rounded-2xl text-white font-black text-sm shadow-lg transition-all">확인</button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @media (max-width: 480px) { .xs\\:block { display: block; } .xs\\:hidden { display: none; } }
        .scrollbar-thin::-webkit-scrollbar { width: 3px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        @keyframes bounce-subtle { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        .animate-bounce { animation: bounce-subtle 2s infinite; }
        
        /* 3. 가격 입력 시 숫자 옆에 나타나는 상하 버튼(Spinner) 숨김 처리 CSS */
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }
        input[type="number"] {
            -moz-appearance: textfield;
        }
      `}} />
    </div>
  );
}