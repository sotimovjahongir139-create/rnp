import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as api from '../services/api.js';
import { SKU as SKU_MOCK } from '../data/mockData.js';

const DashboardContext = createContext(null);

export function DashboardProvider({ children }) {
  const [activeSection, setActiveSection] = useState('ishlab-chiqarish');
  const [production, setProduction] = useState(null);
  const [crm, setCrm]               = useState(null);
  const [telegram, setTelegram]     = useState(null);
  const [scripts, setScripts]       = useState(null);
  const [qc, setQc]                 = useState(null);
  const [loading, setLoading]       = useState({});
  const [error, setError]           = useState({});

  const load = useCallback(async (key, fetcher, setter) => {
    setLoading((p) => ({ ...p, [key]: true }));
    try {
      const data = await fetcher();
      setter(data);
      setError((p) => ({ ...p, [key]: null }));
    } catch (e) {
      setError((p) => ({ ...p, [key]: e.message }));
    } finally {
      setLoading((p) => ({ ...p, [key]: false }));
    }
  }, []);

  const refreshProduction = useCallback(() =>
    Promise.all([
      load('dept',    api.fetchDepartments,  (d) => setProduction((p) => ({ ...p, dept: d }))),
      load('weekly',  api.fetchWeekly,        (d) => setProduction((p) => ({ ...p, weekly: d }))),
      load('cycle',   api.fetchCycle,         (d) => setProduction((p) => ({ ...p, cycle: d }))),
      load('tendency',api.fetchTendency,      (d) => setProduction((p) => ({ ...p, tendency: d }))),
      load('prodKpi', api.fetchProductionKPI, (d) => setProduction((p) => ({ ...p, kpi: d }))),
      load('sku',     api.fetchSKU,           (d) => setProduction((p) => ({ ...p, sku: d }))),
    ]), [load]);

  const refreshCRM = useCallback(() =>
    Promise.all([
      load('crmOylik',  api.fetchCRMOylik,   (d) => setCrm((p) => ({ ...p, oylik: d }))),
      load('crmKunlik', api.fetchCRMKunlik,   (d) => setCrm((p) => ({ ...p, kunlik: d }))),
      load('hourly',    api.fetchHourly,      (d) => setCrm((p) => ({ ...p, hourly: d }))),
      load('hourlyK',   api.fetchHourlyK,     (d) => setCrm((p) => ({ ...p, hourlyK: d }))),
    ]), [load]);

  const refreshTelegram = useCallback(() =>
    Promise.all([
      load('tgKpi',  api.fetchTelegramKPI,  (d) => setTelegram((p) => ({ ...p, kpi: d }))),
      load('cats',   api.fetchCategories,   (d) => setTelegram((p) => ({ ...p, cats: d }))),
    ]), [load]);

  const refreshScripts = useCallback(() =>
    load('scripts', api.fetchScripts, setScripts),
  [load]);

  const refreshQC = useCallback(() =>
    Promise.all([
      load('qcKpi',       api.fetchQCKpi,       (d) => setQc((p) => ({ ...p, kpi: d }))),
      load('qcTrend',     api.fetchQCTrend,      (d) => setQc((p) => ({ ...p, trend: d }))),
      load('qcTopModels', api.fetchQCTopModels,  (d) => setQc((p) => ({ ...p, topModels: d }))),
      load('qcSabablari', api.fetchQCSabablari,  (d) => setQc((p) => ({ ...p, sabablari: d }))),
      load('qcTop10',     api.fetchQCTop10,      (d) => setQc((p) => ({ ...p, top10: d }))),
    ]), [load]);

  // Trigger all scripts on login (provider mounts once after auth)
  useEffect(() => {
    api.triggerAllScripts().catch(() => {});
  }, []);

  return (
    <DashboardContext.Provider value={{
      activeSection, setActiveSection,
      production, crm, telegram, scripts, qc,
      loading, error,
      refreshProduction, refreshCRM, refreshTelegram, refreshScripts, refreshQC,
    }}>
      {children}
    </DashboardContext.Provider>
  );
}

export const useDashboard = () => useContext(DashboardContext);
