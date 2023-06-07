import { configureStore } from '@reduxjs/toolkit'
import { alertSlice } from './alert/alertSlice'

export const store = configureStore({
    reducer: {
        alert: alertSlice.reducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
})

export type AppDispatch = typeof store.dispatch
export type RootState = ReturnType<typeof store.getState>