import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ValidationResult, ExtendedValidationResult, ValidationTab, TabState } from '../types';

// Dashboard data types
export interface DashboardData {
  metricsData: any | null;
  shaclData: any | null;
  isMetricsLoaded: boolean;
  isShaclLoaded: boolean;
}

// Global app state
export interface AppState {
  // Validation state
  tabState: TabState;
  sidebarVisible: boolean;
  
  // Dashboard state
  dashboardData: DashboardData;
  
  // Shared state for navigation
  lastValidationResult: ExtendedValidationResult | null;
}

// Default state
const defaultTabState: TabState = {
  tabs: [
    {
      id: 'tab-1',
      name: '#1',
      createdAt: new Date(),
      isValidating: false,
      result: null,
      error: null
    }
  ],
  activeTabId: 'tab-1',
  nextTabId: 2
};

const defaultAppState: AppState = {
  tabState: defaultTabState,
  sidebarVisible: true,
  dashboardData: {
    metricsData: null,
    shaclData: null,
    isMetricsLoaded: false,
    isShaclLoaded: false
  },
  lastValidationResult: null
};

// Context
const AppStateContext = createContext<{
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  updateTabState: (updates: Partial<TabState>) => void;
  updateDashboardData: (updates: Partial<DashboardData>) => void;
  setLastValidationResult: (result: ExtendedValidationResult | null) => void;
  setSidebarVisible: (visible: boolean) => void;
}>({
  state: defaultAppState,
  setState: () => {},
  updateTabState: () => {},
  updateDashboardData: () => {},
  setLastValidationResult: () => {},
  setSidebarVisible: () => {}
});

// Provider component
export const AppStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(defaultAppState);

  const updateTabState = (updates: Partial<TabState>) => {
    setState(prev => ({
      ...prev,
      tabState: { ...prev.tabState, ...updates }
    }));
  };

  const updateDashboardData = (updates: Partial<DashboardData>) => {
    setState(prev => ({
      ...prev,
      dashboardData: { ...prev.dashboardData, ...updates }
    }));
  };

  const setLastValidationResult = (result: ExtendedValidationResult | null) => {
    setState(prev => ({
      ...prev,
      lastValidationResult: result
    }));
  };

  const setSidebarVisible = (visible: boolean) => {
    setState(prev => ({
      ...prev,
      sidebarVisible: visible
    }));
  };

  return (
    <AppStateContext.Provider
      value={{
        state,
        setState,
        updateTabState,
        updateDashboardData,
        setLastValidationResult,
        setSidebarVisible
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
};

// Hook to use the context
export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
};

export default AppStateContext;