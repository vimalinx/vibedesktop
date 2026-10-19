"use client";
import { createContext, useContext } from "react";
export const WindowVisible = createContext(true);
export const useWindowVisible = () => useContext(WindowVisible);
