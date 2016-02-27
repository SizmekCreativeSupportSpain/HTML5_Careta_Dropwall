var adConfig = {
    "contraido_width": "990",
    "contraido_height": "90",
    "panel_automatico_width": "1029",
    "panel_automatico_height": "1000",
    "panel_usuario_width": "1029",
    "panel_usuario_height": "1000",
    "delay_expansion": "300", // milisegundos
    "auto_cierre": "4000", // milisegundos
    "frequencyCapping": "DAY" // or "SESSION" for once per page session, "WEEK" for once per week, "CAMPAIGN" for once per campaign, "UNLIMITED" for unlimited
};

////////Funciones comunes, NO ELIMINAR!!!!!!!!////////////////////

function initEB(){
	if (!EB.isInitialized()) {
		EB.addEventListener(EBG.EventName.EB_INITIALIZED, startAd);
	}else {
		startAd();
	}
}

function is_touch_device() {
	return (('ontouchstart' in window) || (navigator.MaxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0));
}

window.addEventListener("load", initEB);
///////////////////////////////////////////////////////////////////