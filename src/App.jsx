// 파일명: src/App.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Clock, Users, Utensils, Plus, Minus, X, Check, ArrowRight, AlertCircle, Settings, Trash2, Wifi } from 'lucide-react';
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase"; // 방금 만든 설정 파일 연동

const SYSTEM_CONFIG = {
  TOTAL_TABLES: 16,
  DEFAULT_TIME_LIMIT_MIN: 120, 
  MERGE_BONUS_MIN: 30,         
};

const INITIAL_MENU = [
  { id: 'm1', name: '참이슬', price: 5000, category: '주류' },
  { id: 'm2', name: '카스', price: 5000, category: '주류' },
  { id: 'm3', name: '모듬어묵탕', price: 18000, category: '안주' },
  { id: 'm4', name: '순살 가라아게', price: 20000, category: '안주' },
  { id: 'm5', name: '과일화채', price: 15000, category: '안주' },
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
  // --- 상태 관리 ---
  const [tables, setTables] = useState([]);
  const [menuCatalog, setMenuCatalog] = useState([]);
  const [isDbReady, setIsDbReady] = useState(false); // DB 연결 상태
  
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [selectedTableId, setSelectedTableId] = useState(null);
  
  const [isMergeMode, setIsMergeMode] = useState(false);
  const [isMenuConfigOpen, setIsMenuConfigOpen] = useState(false);
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

  // --- ☁️ [핵심] Firestore 실시간 동기화 (구독) ---
  useEffect(() => {
    // "pos_data" 컬렉션의 "main_status" 단일 문서를 감시합니다.
    const docRef = doc(db, "pos_data", "main_status");
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTables(data.tables || []);
        setMenuCatalog(data.menuCatalog || []);
        setIsDbReady(true);
      } else {
        // 최초 실행 시 DB에 기본 구조를 생성합니다.
        setDoc(docRef, {
          tables: INITIAL_TABLES,
          menuCatalog: INITIAL_MENU
        });
      }
    });

    return () => unsubscribe(); // 컴포넌트 종료 시 구독 해제
  }, []);

  // --- DB 업데이트 헬퍼 함수 ---
  const updateDB = async (newTables, newMenuCatalog) => {
    await setDoc(doc(db, "pos_data", "main_status"), {
      tables: newTables || tables,
      menuCatalog: newMenuCatalog || menuCatalog
    }, { merge: true });
  };

  // --- 실시간 시간 동기화 및 ESC 제어 ---
  useEffect(() => {
    const timerInterval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timerInterval);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (dialogConfig.isOpen) closeDialog();
        else if (isMergeMode) setIsMergeMode(false);
        else if (isMenuConfigOpen) setIsMenuConfigOpen(false);
        else if (selectedTableId !== null) setSelectedTableId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogConfig.isOpen, isMergeMode, isMenuConfigOpen, selectedTableId]);

  // --- 유틸리티 함수 ---
  const formatCurrency = (amount) => amount.toLocaleString('ko-KR') + '원';
  const calculateTotalAmount = (orders) => orders.reduce((sum, order) => sum + (order.price * order.quantity), 0);

  const computeTimeMetrics = (startTime, timeLimit, currentTimestamp) => {
    if (!startTime) return { elapsedStr: '00:00', remainingStr: '00:00', isOvertime: false };
    const elapsedMs = currentTimestamp - startTime;
    const remainingMs = (timeLimit * 60 * 1000) - elapsedMs;
    const isOvertime = remainingMs < 0;
    const absRemaining = Math.abs(remainingMs);
    const pad = (num) => String(num).padStart(2, '0');
    
    return {
      elapsedStr: `${pad(Math.floor(elapsedMs / 3600000))}:${pad(Math.floor((elapsedMs % 3600000) / 60000))}`,
      remainingStr: `${isOvertime ? '+' : ''}${pad(Math.floor(absRemaining / 3600000))}:${pad(Math.floor((absRemaining % 3600000) / 60000))}:${pad(Math.floor((absRemaining % 60000) / 1000))}`,
      isOvertime
    };
  };

  const showDialog = (title, message, onConfirm) => setDialogConfig({ isOpen: true, title, message, onConfirm });
  const closeDialog = () => setDialogConfig({ isOpen: false, title: '', message: '', onConfirm: null });

  // --- 데이터 조작 (이제 DB로 바로 쏩니다) ---
  const handleAddMenu = () => {
    const newCatalog = [...menuCatalog, { id: `m${Date.now()}`, name: '새로운 메뉴', price: 0, category: '기본' }];
    updateDB(null, newCatalog);
  };

  const handleUpdateMenu = (id, field, value) => {
    const newCatalog = menuCatalog.map(menu => menu.id === id ? { ...menu, [field]: value } : menu);
    updateDB(null, newCatalog);
  };

  const handleDeleteMenu = (id) => {
    if(window.confirm('이 메뉴를 삭제하시겠습니까?')) {
      updateDB(null, menuCatalog.filter(menu => menu.id !== id));
    }
  };

  const handleTableInteraction = (id) => setSelectedTableId(id);

  const processOrderAddition = (menuItem) => {
    const newTables = tables.map(table => {
      if (table.id === selectedTableId) {
        const existingItem = table.orders.find(o => o.id === menuItem.id);
        const updatedOrders = existingItem 
          ? table.orders.map(o => o.id === menuItem.id ? { ...o, quantity: o.quantity + 1 } : o)
          : [...table.orders, { ...menuItem, quantity: 1 }];
        
        const isFirstOrder = table.startTime === null;
        return { 
          ...table, 
          orders: updatedOrders,
          status: isFirstOrder ? 'occupied' : table.status,
          startTime: isFirstOrder ? Date.now() : table.startTime
        };
      }
      return table;
    });
    updateDB(newTables, null);
  };

  const processOrderRemoval = (menuId) => {
    const newTables = tables.map(table => {
      if (table.id === selectedTableId) {
        const existingItem = table.orders.find(o => o.id === menuId);
        if (!existingItem) return table;
        const updatedOrders = existingItem.quantity > 1
          ? table.orders.map(o => o.id === menuId ? { ...o, quantity: o.quantity - 1 } : o)
          : table.orders.filter(o => o.id !== menuId);
        return { ...table, orders: updatedOrders };
      }
      return table;
    });
    updateDB(newTables, null);
  };

  const executeCheckout = () => {
    const table = tables.find(t => t.id === selectedTableId);
    if(table.orders.length === 0) { setSelectedTableId(null); return; }

    const totalAmount = calculateTotalAmount(table.orders);
    showDialog(
      '결제 처리',
      `[${table.label}]의 결제를 완료하시겠습니까?\n최종 결제 금액은 ${formatCurrency(totalAmount)} 입니다.`,
      () => {
        const newTables = tables.map(t => 
          t.id === selectedTableId 
            ? { ...t, status: 'empty', orders: [], startTime: null, timeLimit: SYSTEM_CONFIG.DEFAULT_TIME_LIMIT_MIN, label: `테이블 ${t.id}` }
            : t
        );
        updateDB(newTables, null);
        setSelectedTableId(null);
        closeDialog();
      }
    );
  };

  const executeTableMerge = (sourceTableId) => {
    const targetTable = tables.find(t => t.id === selectedTableId);
    const sourceTable = tables.find(t => t.id === sourceTableId);

    showDialog(
      '테이블 합석 처리',
      `[${sourceTable.label}]을(를) [${targetTable.label}]로 합석하시겠습니까?\n주문 내역이 병합되며 잔여 시간이 ${SYSTEM_CONFIG.MERGE_BONUS_MIN}분 연장됩니다.`,
      () => {
        const newTables = [...tables];
        const targetIdx = newTables.findIndex(t => t.id === selectedTableId);
        const sourceIdx = newTables.findIndex(t => t.id === sourceTableId);

        const mergedOrders = [...newTables[targetIdx].orders];
        newTables[sourceIdx].orders.forEach(sourceItem => {
          const existingIdx = mergedOrders.findIndex(item => item.id === sourceItem.id);
          if (existingIdx !== -1) {
            mergedOrders[existingIdx] = { ...mergedOrders[existingIdx], quantity: mergedOrders[existingIdx].quantity + sourceItem.quantity };
          } else {
            mergedOrders.push({ ...sourceItem });
          }
        });

        newTables[targetIdx] = {
          ...newTables[targetIdx],
          orders: mergedOrders,
          timeLimit: newTables[targetIdx].timeLimit + SYSTEM_CONFIG.MERGE_BONUS_MIN,
          label: `${newTables[targetIdx].label} (+${sourceTable.id}번)`
        };

        newTables[sourceIdx] = {
          ...newTables[sourceIdx],
          status: 'empty', orders: [], startTime: null,
          timeLimit: SYSTEM_CONFIG.DEFAULT_TIME_LIMIT_MIN,
          label: `테이블 ${sourceTable.id}`
        };

        updateDB(newTables, null);
        setIsMergeMode(false);
        closeDialog();
      }
    );
  };

  const activeTable = useMemo(() => tables.find(t => t.id === selectedTableId), [tables, selectedTableId]);
  const availableMergeTargets = useMemo(() => tables.filter(t => t.status === 'occupied' && t.id !== selectedTableId), [tables, selectedTableId]);

  // 로딩 화면 처리
  if (!isDbReady) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-4">
        <Wifi className="h-10 w-10 text-indigo-500 animate-pulse" />
        <h2 className="text-xl font-bold">서버와 실시간 연결 중입니다...</h2>
        <p className="text-slate-400 text-sm">Cloud Firestore 동기화 대기 중</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 font-sans selection:bg-indigo-500/30">
      {/* 헤더 */}
      <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-700 pb-5 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <Utensils className="h-8 w-8 text-indigo-400" />
            통합 주점 POS 시스템
          </h1>
          <p className="text-emerald-400 mt-2 text-sm flex items-center gap-1">
            <Wifi className="h-4 w-4" /> 실시간 클라우드 동기화 켜짐
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsMenuConfigOpen(true)}
            className="flex items-center gap-2 bg-slate-800 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-500 text-slate-300 px-4 py-3 rounded-xl transition-all"
          >
            <Settings className="h-5 w-5" />
            <span className="font-semibold text-sm">메뉴 관리</span>
          </button>
          <div className="bg-slate-800/50 px-5 py-3 rounded-xl border border-slate-700/50 flex flex-col items-end min-w-[140px]">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">System Time</span>
            <span className="text-xl font-mono tracking-widest text-indigo-300">
              {new Date(currentTime).toLocaleTimeString('ko-KR', { hour12: false })}
            </span>
          </div>
        </div>
      </header>

      {/* 테이블 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        {tables.map(table => {
          const { elapsedStr, remainingStr, isOvertime } = computeTimeMetrics(table.startTime, table.timeLimit, currentTime);
          const currentTotal = calculateTotalAmount(table.orders);
          const isOccupied = table.status === 'occupied';
          
          return (
            <button
              key={table.id}
              onClick={() => handleTableInteraction(table.id)}
              className={`
                relative flex flex-col text-left p-5 rounded-2xl shadow-lg transition-all duration-300 border-2 outline-none
                ${!isOccupied 
                  ? 'bg-slate-800/40 border-slate-700/50 hover:border-indigo-500/50 hover:bg-slate-800' 
                  : 'bg-gradient-to-br from-slate-800 to-slate-800/90 border-indigo-500 hover:border-indigo-400 transform hover:-translate-y-1'
                }
              `}
            >
              <div className="flex justify-between items-start w-full mb-4">
                <span className={`text-lg font-bold ${isOccupied ? 'text-white' : 'text-slate-400'}`}>{table.label}</span>
                {isOccupied && (
                  <span className={`px-2.5 py-1 rounded-md text-xs font-bold font-mono shadow-inner ${isOvertime ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'}`}>
                    {isOvertime ? '초과 ' : '잔여 '}{remainingStr}
                  </span>
                )}
              </div>

              {!isOccupied ? (
                <div className="flex flex-col items-center justify-center flex-1 w-full text-slate-500 py-6">
                  <Users className="h-10 w-10 mb-3 opacity-40" />
                  <span className="text-sm font-medium">빈 테이블 (클릭하여 주문)</span>
                </div>
              ) : (
                <div className="flex flex-col w-full flex-1">
                  <div className="mb-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-900/50 p-2 rounded-lg">
                      <Clock className="h-4 w-4 text-indigo-400" />
                      <span>경과 시간</span>
                      <span className="ml-auto font-mono text-slate-300">{elapsedStr}</span>
                    </div>
                    <div className="pt-2">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        주문 내역 ({table.orders.reduce((acc, o) => acc + o.quantity, 0)})
                      </div>
                      <div className="max-h-24 overflow-y-auto pr-1 space-y-1 scrollbar-thin">
                        {table.orders.map(order => (
                          <div key={order.id} className="flex justify-between text-sm py-1 border-b border-slate-700/50 last:border-0">
                            <span className="truncate pr-2 text-slate-300">{order.name}</span>
                            <span className="flex-shrink-0 text-slate-400 font-medium">{order.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-auto pt-4 border-t border-slate-700 flex justify-between items-end">
                    <span className="text-sm font-medium text-slate-400">결제 예정액</span>
                    <span className="text-xl font-bold text-emerald-400 tracking-tight">{formatCurrency(currentTotal)}</span>
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 테이블 관리 모달 */}
      {activeTable && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-40">
          <div className="bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-700 ring-1 ring-white/10">
            <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-900">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  {activeTable.label} <span className="text-slate-500 text-lg font-normal">관리 메뉴</span>
                </h2>
                {activeTable.status === 'empty' && (
                  <p className="text-indigo-400 text-sm mt-1">메뉴를 추가하는 즉시 시스템 전역에 시간이 동기화됩니다. (ESC 닫기)</p>
                )}
              </div>
              <button onClick={() => { setSelectedTableId(null); setIsMergeMode(false); }} className="text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-full transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-[500px]">
              <div className="w-full md:w-3/5 p-6 border-r border-slate-800 overflow-y-auto bg-slate-900/50">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">메뉴 추가</h3>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {menuCatalog.map(menu => (
                    <button
                      key={menu.id}
                      onClick={() => processOrderAddition(menu)}
                      className="bg-slate-800 hover:bg-indigo-600/20 border border-slate-700 hover:border-indigo-500 rounded-xl p-4 text-left transition-all group flex flex-col justify-between h-24 shadow-sm"
                    >
                      <div className="text-sm font-semibold text-slate-200 group-hover:text-indigo-200">{menu.name}</div>
                      <div className="text-sm font-medium text-indigo-400 mt-2">{formatCurrency(Number(menu.price))}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-full md:w-2/5 flex flex-col bg-slate-900">
                <div className="p-6 flex-1 flex flex-col overflow-hidden">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">현재 주문 내역</h3>
                  <div className="flex-1 overflow-y-auto pr-2 space-y-3 scrollbar-thin">
                    {activeTable.orders.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-500 text-sm">주문 대기 중입니다.</div>
                    ) : (
                      activeTable.orders.map(order => (
                        <div key={order.id} className="flex items-center justify-between bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm">
                          <div className="flex-1">
                            <div className="text-sm font-bold text-white mb-1">{order.name}</div>
                            <div className="text-xs font-medium text-slate-400">{formatCurrency(Number(order.price))}</div>
                          </div>
                          <div className="flex items-center gap-4 bg-slate-900 p-1.5 rounded-lg border border-slate-700">
                            <button onClick={() => processOrderRemoval(order.id)} className="p-1.5 rounded-md text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition-colors">
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="w-4 text-center font-bold text-white">{order.quantity}</span>
                            <button onClick={() => processOrderAddition(order)} className="p-1.5 rounded-md text-slate-400 hover:bg-indigo-500/20 hover:text-indigo-400 transition-colors">
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="p-6 border-t border-slate-800 bg-slate-900 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.5)]">
                  <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700 mb-4">
                    <div className="flex justify-between items-end">
                      <span className="text-sm font-medium text-slate-400">총 결제 금액</span>
                      <span className="text-3xl font-extrabold text-emerald-400 tracking-tight">
                        {formatCurrency(calculateTotalAmount(activeTable.orders))}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setIsMergeMode(true)}
                      disabled={activeTable.status === 'empty'}
                      className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white py-4 rounded-xl font-semibold border border-slate-600 transition-colors"
                    >
                      <ArrowRight className="h-5 w-5 text-indigo-400" /> 합석
                    </button>
                    <button
                      onClick={executeCheckout}
                      className="flex-[2] flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-xl font-bold shadow-lg shadow-indigo-900/30 transition-all"
                    >
                      <Check className="h-5 w-5" /> 결제 및 종료
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {isMergeMode && (
              <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-6 z-50">
                <div className="bg-slate-800 p-8 rounded-2xl w-full max-w-lg border border-slate-700 shadow-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <ArrowRight className="h-6 w-6 text-indigo-400" />
                    <h3 className="text-xl font-bold text-white">합석 대상 테이블 선택</h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-3 mb-6 scrollbar-thin">
                    {availableMergeTargets.length === 0 ? (
                      <div className="p-6 text-center text-slate-500 bg-slate-900/50 rounded-xl border border-slate-800">합석 가능한 테이블이 없습니다.</div>
                    ) : (
                      availableMergeTargets.map(t => (
                        <button key={t.id} onClick={() => executeTableMerge(t.id)} className="w-full flex justify-between items-center p-5 bg-slate-900/50 hover:bg-indigo-600/20 rounded-xl border border-slate-700 hover:border-indigo-500 transition-all text-left group">
                          <div>
                            <div className="font-bold text-slate-200 group-hover:text-white">{t.label}</div>
                            <div className="text-sm font-medium text-emerald-400 mt-1">현재 주문액: {formatCurrency(calculateTotalAmount(t.orders))}</div>
                          </div>
                          <div className="bg-slate-800 p-2 rounded-lg group-hover:bg-indigo-500/30"><Plus className="text-slate-400 group-hover:text-indigo-300 h-5 w-5" /></div>
                        </button>
                      ))
                    )}
                  </div>
                  <button onClick={() => setIsMergeMode(false)} className="w-full py-4 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-semibold transition-colors">취소</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 메뉴 관리 모달 */}
      {isMenuConfigOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 p-8 rounded-2xl w-full max-w-2xl border border-slate-700 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-700 pb-4 mb-4">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Settings className="h-6 w-6 text-indigo-400" /> 메뉴 및 시스템 관리
              </h2>
              <button onClick={() => setIsMenuConfigOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin pr-2 mb-4">
              <div className="space-y-3">
                {menuCatalog.map(menu => (
                  <div key={menu.id} className="flex gap-3 items-center bg-slate-900/50 p-3 rounded-xl border border-slate-700">
                    <input 
                      type="text" value={menu.name}
                      onChange={(e) => handleUpdateMenu(menu.id, 'name', e.target.value)}
                      placeholder="메뉴명" className="flex-1 bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    />
                    <div className="relative">
                      <input 
                        type="number" value={menu.price}
                        onChange={(e) => handleUpdateMenu(menu.id, 'price', e.target.value)}
                        placeholder="가격" className="w-32 bg-slate-800 border border-slate-600 text-white rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:border-indigo-500"
                      />
                      <span className="absolute right-3 top-2 text-slate-400 text-sm">원</span>
                    </div>
                    <button onClick={() => handleDeleteMenu(menu.id)} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors">
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={handleAddMenu} className="w-full flex items-center justify-center gap-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/50 py-4 rounded-xl font-semibold transition-colors mt-auto">
              <Plus className="h-5 w-5" /> 새로운 메뉴 항목 추가
            </button>
          </div>
        </div>
      )}

      {/* 공통 다이얼로그 */}
      {dialogConfig.isOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-slate-800 p-8 rounded-2xl w-full max-w-sm border border-slate-700 shadow-2xl transform transition-all">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-indigo-400" />
              <h3 className="text-xl font-bold text-white">{dialogConfig.title}</h3>
            </div>
            <p className="text-slate-300 mb-8 whitespace-pre-wrap text-sm leading-relaxed">{dialogConfig.message}</p>
            <div className="flex gap-3">
              <button onClick={closeDialog} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-semibold transition-colors">취소</button>
              <button onClick={dialogConfig.onConfirm} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold shadow-lg shadow-indigo-900/30 transition-all">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}