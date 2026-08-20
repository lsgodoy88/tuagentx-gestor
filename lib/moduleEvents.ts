// Eventos globales para notificar al layout si hay un módulo abierto
export const notifyModuleOpen  = () => window.dispatchEvent(new Event('module:open'))
export const notifyModuleClose = () => window.dispatchEvent(new Event('module:close'))
