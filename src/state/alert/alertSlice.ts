import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../store";

export interface Alert {
    message: string;
    type: "success" | "error" | "warning";
}

export type AlertState = {
    alerts: Alert[];
    pending: boolean;
    error: boolean;
}

const initialState: AlertState = {
    alerts: [],
    pending: false,
    error: false,
}

export const alertSlice = createSlice({
    name: "alert",
    initialState,
    reducers: {
        addAlert: (state, action: PayloadAction<Alert>) => {
            state.alerts.push(action.payload);
        },
        removeAlert: (state) => {
            state.alerts.pop();
        },
        clearAlerts: (state) => {
            state.alerts = [];
        },
    },
});

export const selectAlerts = (state: RootState) =>
  state.alert.alerts;

export const { addAlert, removeAlert, clearAlerts } = alertSlice.actions;
