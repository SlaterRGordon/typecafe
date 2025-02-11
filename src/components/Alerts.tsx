import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { removeAlert, selectAlerts } from "~/state/alert/alertSlice";


export const Alerts = () => {
    const alerts = useSelector(selectAlerts)
    const dispatch = useDispatch()

    useEffect(() => {
        if (alerts.length > 0) {
            const timeout = setTimeout(() => {
                dispatch(removeAlert())
            }, 5000)

            return () => clearTimeout(timeout)
        }
    }, [alerts, dispatch])

    return (
        <div className="toast toast-top toast-end mt-[4rem] z-[1000]">
            {/* If there are no alerts, don't render anything */}
            {alerts.length === 0 ? <></> :
                <div className={`alert bg-primary`}>
                    <span className="text-lg font-bold">{alerts[alerts.length - 1]?.message}</span>
                    <label
                        className="btn btn-ghost btn-circle btn-sm"
                        onClick={() => dispatch(removeAlert())}
                    >
                        <svg className="color-secondary" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" /></svg>
                    </label>
                </div>
            }
        </div>
    )
}