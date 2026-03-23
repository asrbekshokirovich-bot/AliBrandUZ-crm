import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AnalyticsData {
  generatedAt: string;
  today: {
    date: string;
    orders: number;
    revenue: number;
    commission: number;
    netProfit: number;
  };
  weekly: {
    income: number;
    expense: number;
    net: number;
    trend: Array<{ date: string; revenue: number; orders: number }>;
  };
  inventory: {
    total: number;
    outOfStock: number;
    lowStock: number;
    healthy: number;
    products: Array<{
      name: string; sku: string; stock: number;
      priceCny: number; landedCostCny: number; landedCostUzs: number;
      isLowStock: boolean; isOutOfStock: boolean; hasNoWeight: boolean;
    }>;
  };
  logistics: {
    total: number;
    delayed: number;
    feePerGram: number;
    boxes: Array<Record<string, unknown>>;
  };
  tasks: { total: number; overdue: number };
  problems: Array<{
    type: string;
    severity: 'critical' | 'warning';
    title: string;
    description: string;
    count: number;
  }>;
  topProducts: Array<{ name: string; qty: number; revenue: number }>;
  platformBreakdown: Array<{ platform: string; revenue: number; orders: number }>;
}

export type AnalyticsView = 'today' | 'problems' | 'top-products' | 'inventory' | 'logistics';

interface UseAIAnalyticsReturn {
  data: AnalyticsData | null;
  loading: boolean;
  error: string | null;
  activeView: AnalyticsView | null;
  fetchAnalytics: (view: AnalyticsView) => Promise<void>;
  clearAnalytics: () => void;
}

export function useAIAnalytics(): UseAIAnalyticsReturn {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AnalyticsView | null>(null);

  const fetchAnalytics = useCallback(async (view: AnalyticsView) => {
    setLoading(true);
    setError(null);
    setActiveView(view);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/api/ai-analytics', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Server error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const clearAnalytics = useCallback(() => {
    setData(null);
    setActiveView(null);
    setError(null);
  }, []);

  return { data, loading, error, activeView, fetchAnalytics, clearAnalytics };
}
