/** UI-1 connects the Toast/useToast component here. */
export default function ToastHost() {
 return <div id="toast-host" role="status" aria-live="polite" aria-atomic="true" className="pointer-events-none fixed inset-x-4 bottom-[calc(108px+env(safe-area-inset-bottom))] z-50" />
}
