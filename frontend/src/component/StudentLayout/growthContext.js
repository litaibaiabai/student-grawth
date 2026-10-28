import { createContext, useContext } from 'react';
export const GrowthContext = createContext(null);
export const useStudentGrowth = () => useContext(GrowthContext);
