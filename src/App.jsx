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
  TOTAL_TABLES: 38,
  DEFAULT_TIME_LIMIT_MIN: 120, 
  MERGE_BONUS_MIN: 30,         
};

const INITIAL_MENU = [
  // 메인 메뉴
  { id: 'm1', category: 'main', name: 'LGㅔ육 트윈스', price: 21000 },
  { id: 'm2', category: 'main', name: '계란 후라이온즈 스팸 주먹밥', price: 19000 },
  { id: 'm3', category: 'main', name: '삼구삼진어묵탕', price: 17000 },
  { id: 'm4', category: 'main', name: '치킨롯데리야끼 볶음밥', price: 16000 },
  
  // 사이드 메뉴
  { id: 'm5', category: 'side', name: '감튀 하나 익을쓰', price: 9000 },
  { id: 'm6', category: 'side', name: '황도따다 두손베어스', price: 9000 },
  { id: 'm7', category: 'side', name: 'Nㅓ겟 Cㅣ킨 다이노스', price: 10000 },
  { id: 'm11', category: 'side', name: '마카로니 과자추가', price: 1000 },

  // 음료
  { id: 'm8', category: 'drink', name: '콜라', price: 2000 },
  { id: 'm9', category: 'drink', name: '사이다', price: 2000 },
  { id: 'm10', category: 'drink', name: '생수', price: 0 },
];

const INITIAL_TABLES = Array.from({ length: SYSTEM_CONFIG.TOTAL_TABLES }, (_, i) => ({
  id: i + 1,
  label: `테이블 ${i + 1}`,
  status: 'empty', 
  orders: [], 
  startTime: null, 
  timeLimit: SYSTEM_CONFIG.DEFAULT_TIME_LIMIT_MIN,
}));

function MenuConfigItem({ item, onUpdate, onDelete }) {
  const [localName, setLocalName] = useState(item.name);
  const [localPrice, setLocalPrice] = useState(item.price);

  useEffect(() => {
    setLocalName(item.name);
    setLocalPrice(item.price);
  }, [item.name, item.price]);

  const handleBlur = () => {
    if (localName !== item.name || localPrice !== item.price) {
      onUpdate({ ...item, name: localName, price: localPrice });
    }
  };

  return (
    <div className="flex flex-wrap sm:flex-nowrap gap-3 bg-slate-950 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-800 shadow-lg transition-all items-center">
      <select 
        value={item.category || 'main'} 
        onChange={(e) => onUpdate({ ...item, category: e.target.value })} 
        className="bg-slate-800 border-none rounded-lg px-3 py-2.5 font-bold text-slate-300 text-xs sm:text-sm outline-none focus:ring-1 ring-indigo-600 appearance-none"
      >
        <option value="main">메인</option>
        <option value="side">사이드</option>
        <option value="drink">음료</option>
      </select>

      <input 
        type="text" 
        value={localName} 
        onChange={(e) => setLocalName(e.target.value)} 
        onBlur={handleBlur}
        className="flex-1 min-w-[120px] bg-slate-900 border-none rounded-lg px-3 py-2 font-bold text-white text-sm sm:text-base outline-none focus:ring-1 ring-indigo-600" 
      />
      
      <input 
        type="number" 
        value={localPrice} 
        onChange={(e) => setLocalPrice(Number(e.target.value))} 
        onBlur={handleBlur}
        className="w-24 sm:w-32 bg-slate-900 border-none rounded-lg px-3 py-2 font-bold text-emerald-400 text-right text-sm sm:text-base outline-none focus:ring-1 ring-indigo-600" 
      />
      
      <button onClick={onDelete} className="p-2 sm:p-3 text-slate-700 hover:text-rose-500"><Trash2 className="h-5 w-5" /></button>
    </div>
  );
}

export default function App() {
  const [viewMode, setViewMode] = useState('pos');
  const [kitchenTab, setKitchenTab] = useState('queue'); 
  const [tables, setTables] = useState([]);
  const [menuCatalog, setMenuCatalog] = useState([]);
  const [completedLogs, setCompletedLogs] = useState([]); 
  const [paymentLogs, setPaymentLogs] = useState([]); // 당일 결제 승인 내역 실시간 저장용
  const [salesHistory, setSalesHistory] = useState([]); // 시간이 지나도 유지되는 영구 매출 보존 기록용
  const [isDbReady, setIsDbReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [selectedTableId, setSelectedTableId] = useState(null);
  
  const [isMergeMode, setIsMergeMode] = useState(false);
  const [isMenuConfigOpen, setIsMenuConfigOpen] = useState(false);
  const [isSalesModalOpen, setIsSalesModalOpen] = useState(false); // 매출 상세 모달 제어 상태
  const [salesTab, setSalesTab] = useState('current'); // 매출 정보 내 서브 탭 제어 ('current' | 'history')
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

  useEffect(() => {
    const docRef = doc(db, "pos_data", "main_status");
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTables(data.tables || []);
        setMenuCatalog(data.menuCatalog || []);
        setCompletedLogs(data.completedLogs || []); 
        setPaymentLogs(data.paymentLogs || []);
        setSalesHistory(data.salesHistory || []);
        setIsDbReady(true);
      } else {
        setDoc(docRef, { tables: INITIAL_TABLES, menuCatalog: INITIAL_MENU, completedLogs: [], paymentLogs: [], salesHistory: [] });
      }
    });
    return () => unsubscribe();
  }, []);

  const updateDB = async (newTables, newMenuCatalog, newLogs, newPayments, newHistory) => {
    const payload = {};
    if (newTables) payload.tables = newTables;
    if (newMenuCatalog) payload.menuCatalog = newMenuCatalog;
    if (newLogs) payload.completedLogs = newLogs;
    if (newPayments) payload.paymentLogs = newPayments;
    if (newHistory) payload.salesHistory = newHistory;

    await setDoc(doc(db, "pos_data", "main_status"), payload, { merge: true });
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (dialogConfig.isOpen) setDialogConfig(prev => ({...prev, isOpen: false}));
        else if (isMergeMode) setIsMergeMode(false);
        else if (isMenuConfigOpen) setIsMenuConfigOpen(false);
        else if (isSalesModalOpen) setIsSalesModalOpen(false);
        else if (selectedTableId !== null) setSelectedTableId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogConfig.isOpen, isMergeMode, isMenuConfigOpen, isSalesModalOpen, selectedTableId]);

  // 실시간 당일 매출 총액 환산 로직
  const todayTotalSales = useMemo(() => {
    return paymentLogs.reduce((sum, log) => sum + (log.totalAmount || 0), 0);
  }, [paymentLogs]);

  // 메뉴별 나간 총 수량 및 매출 비율 산출 데이터
  const menuSalesSummary = useMemo(() => {
    const summary = {};
    paymentLogs.forEach(log => {
      if (log.orders) {
        log.orders.forEach(order => {
          if (!summary[order.id]) {
            summary[order.id] = { name: order.name, quantity: 0, amount: 0 };
          }
          summary[order.id].quantity += order.quantity;
          summary[order.id].amount += (order.price * order.quantity);
        });
      }
    });
    return Object.values(summary).sort((a, b) => b.amount - a.amount);
  }, [paymentLogs]);

  // 실시간 매출 정보를 영구 아카이브 영역에 기록 보존하는 기능
  const recordSalesToHistory = () => {
    if (todayTotalSales === 0) {
      alert("백업 등록할 당일 매출 내역이 존재하지 않습니다.");
      return;
    }
    const dateString = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const existingIdx = salesHistory.findIndex(h => h.date === dateString);
    let newHistory = [...(salesHistory || [])];

    if (existingIdx !== -1) {
      newHistory[existingIdx] = {
        ...newHistory[existingIdx],
        totalAmount: todayTotalSales, 
      };
    } else {
      newHistory.push({
        id: Date.now().toString(36),
        date: dateString,
        totalAmount: todayTotalSales
      });
    }

    updateDB(null, null, null, null, newHistory);
    alert(`[${dateString}] 매출 내역이 아카이브 보존 공간에 정상 등록되었습니다.`);
  };

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
    let orderNameToLog = "";
    let tableLabelToLog = "";

    const newTables = tables.map(t => {
      if (t.id === tableId) {
        tableLabelToLog = t.label;
        const newOrders = t.orders.map(o => {
          if (o.id === orderId) {
            orderNameToLog = o.name;
            return { ...o, prepared: (o.prepared || 0) + 1 };
          }
          return o;
        });
        return { ...t, orders: newOrders };
      }
      return t;
    });

    const newLog = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 9),
      tableId,
      tableLabel: tableLabelToLog,
      orderName: orderNameToLog,
      completedAt: Date.now()
    };

    const newLogs = [newLog, ...(completedLogs || [])].slice(0, 200);
    updateDB(newTables, null, newLogs);
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

  // 요청사항 1번 반영: 테이블 전체 초기화 진행 시 당일 매출(paymentLogs) 리셋 연동 (과거 아카이브 보존 보증)
  const handleResetAllTables = () => {
    setDialogConfig({
      isOpen: true,
      title: '⚠️ 전체 테이블 및 매출액 초기화',
      message: '모든 테이블의 주문 내역 및 기기 상태가 초기화되며, 당일 실시간 총매출액도 함께 초기화됩니다. (단, 기록 보존 전용 공간의 과거 매출 데이터는 영구 보존됩니다.) 진행하시겠습니까?',
      onConfirm: () => {
        updateDB(INITIAL_TABLES, INITIAL_MENU, [], [], null); 
        setDialogConfig(prev => ({ ...prev, isOpen: false }));
        setIsMenuConfigOpen(false);
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

  const availableMergeTargets = useMemo(() => tables.filter(t => t.status === 'occupied' && t.id !== selectedTableId), [tables, selectedTableId]);

  if (!isDbReady) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white gap-4 p-4">
      <Wifi className="h-10 w-10 text-indigo-500 animate-pulse" />
      <h2 className="text-xl font-bold tracking-tighter text-center">정보시스템학과 POS 연결 중...</h2>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      <nav className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-3 sm:px-6 py-3 sm:py-4 sticky top-0 z-30 shadow-2xl">
        <div className="max-w-[1800px] mx-auto flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-3 sm:gap-6">
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2 tracking-tighter cursor-default">
              <Utensils className="h-6 w-6 sm:h-7 text-indigo-500" /> 
              <span className="hidden xs:block">INFOSYS POS</span>
            </h1>
            
            {/* 상단 배너 실시간 총매출액 연동 컴포넌트 */}
            <button 
              onClick={() => { setIsSalesModalOpen(true); setSalesTab('current'); }}
              className="bg-slate-950 border border-slate-800 hover:border-emerald-500/40 px-3 py-1.5 sm:py-2 rounded-xl flex items-center gap-2 text-xs sm:text-sm font-bold transition-all text-emerald-400 shadow-inner group active:scale-95"
            >
              <span className="text-slate-500 group-hover:text-slate-400 font-bold transition-colors">당일 총매출</span>
              <span className="font-mono text-sm sm:text-base font-black text-emerald-500 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">{formatCurrency(todayTotalSales)}</span>
            </button>

            <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800 shadow-inner">
              <button onClick={() => setViewMode('pos')} className={`flex items-center gap-1.5 px-3 sm:px-5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${viewMode === 'pos' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-200'}`}>
                <LayoutDashboard className="h-3.5 w-3.5" /> 홀
              </button>
              <button onClick={() => { setViewMode('kitchen'); setKitchenTab('queue'); }} className={`flex items-center gap-1.5 px-3 sm:px-5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${viewMode === 'kitchen' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-200'}`}>
                <ChefHat className="h-3.5 w-3.5" /> 주방
                {kitchenData.cards.length > 0 && <span className="ml-1 bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full animate-bounce">{kitchenData.cards.length}</span>}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <button onClick={() => setIsMenuConfigOpen(true)} className="p-2 sm:p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 transition-all duration-200 hover:bg-slate-700 hover:border-indigo-500">
              <Settings className="h-4 w-4 sm:h-5 sm:h-5" />
            </button>
            <div className="text-right cursor-default">
              <div className="text-xs font-mono text-slate-400 font-bold tracking-tighter">
                {new Date(currentTime).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' })}
              </div>
              <div className="text-sm sm:text-base font-mono text-indigo-400 font-bold tracking-tighter leading-none mt-1">
                {new Date(currentTime).toLocaleTimeString('ko-KR', { hour12: false })}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="p-3 sm:p-6 max-w-[1800px] mx-auto">
        {viewMode === 'pos' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-4">
            {tables.map(table => {
              const { remaining, isOver } = computeTime(table.startTime, table.timeLimit, currentTime);
              const isOcc = table.status === 'occupied';
              return (
                <button key={table.id} onClick={() => setSelectedTableId(table.id)} className={`group relative flex flex-col p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 transition-all duration-300 active:scale-95 text-left ${!isOcc ? 'bg-slate-900/40 border-slate-800 hover:border-indigo-500/30' : 'bg-slate-900 border-indigo-600 shadow-indigo-600/10 shadow-xl'}`}>
                  <div className="flex justify-between items-start w-full mb-2 sm:mb-3">
                    <span className={`text-sm sm:text-base font-black transition-colors ${isOcc ? 'text-white' : 'text-slate-600'}`}>{table.label}</span>
                    {isOcc && <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${isOver ? 'text-rose-400 bg-rose-500/10' : 'text-indigo-400 bg-indigo-500/10'}`}>{remaining}</span>}
                  </div>
                  {!isOcc ? <div className="flex-1 flex flex-col items-center justify-center py-4 opacity-20"><Users className="h-6 w-6 mb-2" /><span className="text-[9px] font-bold uppercase tracking-widest">Available</span></div> : (
                    <div className="flex-1 flex flex-col w-full">
                      <div className="space-y-1 mb-2 sm:mb-3 max-h-20 sm:max-h-24 overflow-y-auto scrollbar-thin">
                        {table.orders.map(o => (
                          <div key={o.id} className="flex justify-between text-[11px] sm:text-xs items-center py-0.5 border-b border-slate-800 last:border-0">
                            <span className="text-slate-400 font-medium truncate pr-2">{o.name}</span>
                            <span className={`font-bold transition-colors ${o.prepared >= o.quantity ? 'text-emerald-500' : 'text-white'}`}>{o.prepared || 0}/{o.quantity}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-auto pt-2 border-t border-slate-800 flex justify-between items-baseline">
                        <span className="text-[9px] text-slate-600 font-black tracking-widest">TOTAL</span>
                        <span className="text-base sm:text-lg font-black text-emerald-500 tracking-tighter">{formatCurrency(calculateTotal(table.orders))}</span>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-4 sm:gap-8 animate-in fade-in duration-300">
            <div className="flex-1 order-2 lg:order-1 flex flex-col">
              
              <div className="flex gap-6 mb-4 sm:mb-6 px-1 border-b border-slate-800 relative">
                <button 
                  onClick={() => setKitchenTab('queue')} 
                  className={`text-lg sm:text-xl font-black flex items-center gap-2 pb-3 border-b-[3px] transition-colors relative top-[2px] ${kitchenTab === 'queue' ? 'text-white border-emerald-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
                >
                  <ChefHat className={`h-5 w-5 ${kitchenTab === 'queue' ? 'text-emerald-500' : 'text-slate-500'}`} /> 실시간 조리 대기열
                </button>
                <button 
                  onClick={() => setKitchenTab('log')} 
                  className={`text-lg sm:text-xl font-black flex items-center gap-2 pb-3 border-b-[3px] transition-colors relative top-[2px] ${kitchenTab === 'log' ? 'text-white border-indigo-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
                >
                  <CheckCircle2 className={`h-5 w-5 ${kitchenTab === 'log' ? 'text-indigo-500' : 'text-slate-500'}`} /> 나간 주문 로그
                </button>
              </div>

              {kitchenTab === 'queue' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                  {kitchenData.cards.map((item) => (
                    <div key={item.uniqueKey} className="bg-slate-900 border-2 border-slate-800 rounded-xl sm:rounded-2xl overflow-hidden shadow-xl flex flex-col">
                      <div className="bg-slate-800/80 p-2 sm:p-3 border-b border-slate-800 flex justify-between items-center">
                        <div className="bg-indigo-600 text-white text-xs sm:text-sm font-black px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg shadow-md ring-2 ring-indigo-500/50 flex items-center gap-1">
                          TABLE <span className="text-lg sm:text-xl">{item.tableId}</span>
                        </div>
                        <span className="text-[9px] sm:text-[10px] font-mono text-slate-400 font-bold">{new Date(item.startTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="p-4 sm:p-5 text-center flex-1 flex flex-col justify-center">
                        <div className="text-base sm:text-lg font-black text-white mb-4 sm:mb-5 tracking-tight leading-tight">{item.orderName}</div>
                        <button onClick={() => completeKitchenOrder(item.tableId, item.orderId)} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 sm:py-4 rounded-lg sm:rounded-xl font-black text-sm sm:text-base shadow-lg active:scale-95 flex items-center justify-center gap-1.5">
                          <Check className="h-4 w-4 stroke-[3px]" /> 조리 완료
                        </button>
                      </div>
                    </div>
                  ))}
                  {kitchenData.cards.length === 0 && <div className="col-span-full h-48 sm:h-[60vh] flex flex-col items-center justify-center opacity-10 border-2 border-dashed border-slate-800 rounded-2xl sm:rounded-3xl p-4 text-center"><CheckCircle2 className="h-12 w-12 sm:h-20 sm:h-20 mb-4" /><span className="text-lg sm:text-2xl font-black">대기 주문 없음</span></div>}
                </div>
              ) : (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl flex-1 max-h-[75vh] overflow-y-auto scrollbar-thin">
                  {completedLogs && completedLogs.length > 0 ? (
                    <div className="space-y-3">
                      {completedLogs.map(log => (
                        <div key={log.id} className="flex justify-between items-center bg-slate-950 p-3 sm:p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
                          <div className="flex items-center gap-3 sm:gap-4">
                            <span className="bg-indigo-600/20 text-indigo-400 text-[10px] sm:text-xs font-black px-2.5 py-1 rounded-md whitespace-nowrap">{log.tableLabel}</span>
                            <span className="font-bold text-sm sm:text-base text-slate-200">{log.orderName}</span>
                          </div>
                          <div className="text-[10px] sm:text-xs text-slate-500 font-mono whitespace-nowrap">
                            {new Date(log.completedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-full min-h-[48px] sm:min-h-[40vh] flex flex-col items-center justify-center opacity-30 text-center">
                      <CheckCircle2 className="h-12 w-12 sm:h-16 sm:h-16 mb-4 text-slate-500" />
                      <span className="text-base sm:text-lg font-black text-slate-400">완료된 주문 내역이 없습니다</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <aside className="w-full lg:w-80 order-1 lg:order-2">
              <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 sm:mb-6 flex items-center gap-2 px-1"><ListOrdered className="h-4 w-4 text-emerald-500" /> 메뉴별 대기 합계</h3>
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

      {/* 🟢 요청사항 2, 3번 반영: 매출 상세 정산 및 과거 기록 공간 결합 모달 */}
      {isSalesModalOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 z-50 animate-in zoom-in-95 duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-5 sm:p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tighter">📊 매출 통계 관리 시스템</h2>
                <p className="text-xs text-slate-500 font-bold mt-1">포스기에서 최종 결제 완료 처리된 실시간 정산 명세입니다.</p>
              </div>
              <button onClick={() => setIsSalesModalOpen(false)} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-full transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 매출 상세 공간 서브 네비게이션 탭 */}
            <div className="flex border-b border-slate-800 bg-slate-950/40 px-4">
              <button 
                onClick={() => setSalesTab('current')} 
                className={`px-4 py-3 text-xs sm:text-sm font-black border-b-2 transition-colors ${salesTab === 'current' ? 'text-emerald-500 border-emerald-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
              >
                당일 메뉴별 상세 실적 (2번 요구사항)
              </button>
              <button 
                onClick={() => setSalesTab('history')} 
                className={`px-4 py-3 text-xs sm:text-sm font-black border-b-2 transition-colors ${salesTab === 'history' ? 'text-indigo-500 border-indigo-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
              >
                과거 기록 영구 보존 아카이브 (3번 요구사항)
              </button>
            </div>

            <div className="flex-1 p-4 sm:p-6 overflow-y-auto scrollbar-thin bg-slate-950/10">
              {salesTab === 'current' ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-slate-950 p-4 rounded-xl border border-slate-800 shadow-inner">
                    <span className="text-xs sm:text-sm text-slate-400 font-black uppercase tracking-wider">현재 기준 당일 매출 총액</span>
                    <span className="text-xl sm:text-2xl font-black text-emerald-500 font-mono tracking-tighter">{formatCurrency(todayTotalSales)}</span>
                  </div>
                  
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40 shadow-xl">
                    <div className="grid grid-cols-3 bg-slate-800/50 p-2.5 sm:p-3 text-[11px] font-black text-slate-400 border-b border-slate-800 text-center uppercase tracking-widest">
                      <div>메뉴명</div>
                      <div>총 나간 수량</div>
                      <div className="text-right pr-4">합산 매출액</div>
                    </div>
                    <div className="divide-y divide-slate-800/60 max-h-[40vh] overflow-y-auto scrollbar-thin">
                      {menuSalesSummary.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-3 p-3 text-xs sm:text-sm font-bold text-slate-200 items-center text-center hover:bg-slate-900/60 transition-colors">
                          <div className="text-left font-black text-slate-300 pl-2 truncate">{item.name}</div>
                          <div className="font-mono text-indigo-400">{item.quantity} 개</div>
                          <div className="font-mono text-emerald-400 text-right pr-4 font-black">{formatCurrency(item.amount)}</div>
                        </div>
                      ))}
                      {menuSalesSummary.length === 0 && (
                        <div className="p-8 text-center text-slate-600 text-xs font-bold">당일 최종 정산 처리된 주문 건이 없습니다.</div>
                      )}
                    </div>
                  </div>

                  <button 
                    onClick={recordSalesToHistory}
                    className="w-full bg-emerald-600/10 hover:bg-emerald-600 border border-emerald-500/20 text-emerald-400 hover:text-white py-3 rounded-xl font-black text-xs sm:text-sm transition-all active:scale-95"
                  >
                    💾 현재 매출 데이터를 과거 보존 아카이브에 백업 등록 (확정 마감)
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-xs text-slate-400 font-bold bg-slate-950 p-3.5 rounded-xl border border-slate-800 leading-relaxed shadow-inner">
                    💡 **매출 보존 메커니즘**: 메인 설정에서 `모든 테이블 초기화`를 실행하여 당일 실시간 총액이 리셋되더라도, **이 공간에 기록해 둔 일자별 백업 명세는 영구 소멸되지 않고 시간이 지나도 안전하게 확인 가능**합니다.
                  </div>
                  
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40 shadow-xl">
                    <div className="grid grid-cols-2 bg-slate-800/50 p-3 text-[11px] font-black text-slate-400 border-b border-slate-800 text-center uppercase tracking-widest">
                      <div className="text-left pl-4">정산 일자</div>
                      <div className="text-right pr-6">마감 매출액</div>
                    </div>
                    <div className="divide-y divide-slate-800/60 max-h-[45vh] overflow-y-auto scrollbar-thin">
                      {salesHistory && salesHistory.map((history) => (
                        <div key={history.id} className="grid grid-cols-2 p-3.5 text-xs sm:text-sm font-bold text-slate-200 items-center text-center hover:bg-slate-900/60 transition-colors">
                          <div className="text-left font-black text-slate-300 pl-4">{history.date}</div>
                          <div className="font-mono text-emerald-400 text-right pr-6 font-black">{formatCurrency(history.totalAmount)}</div>
                        </div>
                      ))}
                      {(!salesHistory || salesHistory.length === 0) && (
                        <div className="p-8 text-center text-slate-600 text-xs font-bold">보존 조치된 과거 정산 로그 파일이 비어 있습니다.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedTableId && tables.find(t => t.id === selectedTableId) && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center p-0 xs:p-4 z-40 animate-in fade-in duration-200">
          <div className="bg-slate-900 rounded-none xs:rounded-3xl w-full h-full xs:h-auto max-w-6xl xs:max-h-[90vh] flex flex-col overflow-hidden border-0 xs:border border-slate-800 shadow-2xl relative">
            <div className="p-5 sm:p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tighter text-white">{tables.find(t => t.id === selectedTableId).label}</h2>
              <button onClick={() => setSelectedTableId(null)} className="p-2 sm:p-3 bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 rounded-full transition-all"><X className="h-6 w-6 sm:h-8 sm:h-8" /></button>
            </div>
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              <div className="flex-1 p-3 sm:p-5 overflow-y-auto bg-slate-950/50 space-y-4 sm:space-y-6 scrollbar-thin">
                
                {['main', 'side', 'drink'].map((catKey) => {
                  const items = menuCatalog.filter(m => (m.category || 'main') === catKey);
                  if (items.length === 0) return null;
                  const catName = catKey === 'main' ? '메인 메뉴' : catKey === 'side' ? '사이드 메뉴' : '음료';
                  
                  return (
                    <div key={catKey}>
                      <h3 className="text-sm font-black text-slate-400 mb-3">{catName}</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                        {items.map(menu => (
                          <button key={menu.id} onClick={() => processOrderAddition(menu)} className="bg-slate-900 p-2 sm:p-3 rounded-xl sm:rounded-2xl border border-slate-800 text-left hover:border-indigo-500 transition-all active:scale-95 flex flex-col justify-between h-16 sm:h-20 shadow-sm">
                            <div className="font-black text-xs sm:text-sm text-slate-200 leading-tight line-clamp-2">{menu.name}</div>
                            <div className="text-indigo-400 font-black text-[10px] sm:text-xs">{formatCurrency(menu.price)}</div>
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
                            // 결제 로그 스냅샷 구성 및 누적 배열 결합
                            const totalAmount = calculateTotal(table.orders);
                            const newPayment = {
                              id: Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
                              tableLabel: table.label,
                              orders: table.orders,
                              totalAmount,
                              paidAt: Date.now()
                            };
                            const newPayments = [...(paymentLogs || []), newPayment];

                            updateDB(
                              tables.map(t => t.id === selectedTableId ? { ...t, status: 'empty', orders: [], startTime: null, timeLimit: SYSTEM_CONFIG.DEFAULT_TIME_LIMIT_MIN, label: `테이블 ${t.id}` } : t), 
                              null, 
                              null, 
                              newPayments,
                              null
                            );
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

      {isMenuConfigOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center p-0 xs:p-4 z-50 animate-in zoom-in-95 duration-200">
          <div className="bg-slate-900 rounded-none xs:rounded-3xl w-full h-full xs:h-auto max-w-3xl border-0 xs:border border-slate-800 p-6 sm:p-10 flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-6 sm:mb-8 border-b border-slate-800 pb-4 sm:pb-6">
              <h2 className="text-xl sm:text-3xl font-black flex items-center gap-3"><Settings className="h-6 w-6 sm:h-8 sm:h-8 text-indigo-500" /> 설정 및 관리</h2>
              <button onClick={() => setIsMenuConfigOpen(false)} className="hover:text-rose-500 transition-colors"><X className="h-6 w-6 sm:h-8 sm:h-8" /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3 sm:space-y-4 mb-6 scrollbar-thin pr-2">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Menu Configuration</h3>
              {menuCatalog.map(m => (
                <MenuConfigItem 
                  key={m.id} 
                  item={m} 
                  onUpdate={(updatedItem) => updateDB(null, menuCatalog.map(item => item.id === m.id ? updatedItem : item))} 
                  onDelete={() => updateDB(null, menuCatalog.filter(item => item.id !== m.id))} 
                />
              ))}
            </div>

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