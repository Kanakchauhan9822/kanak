const ext_id = "eanofdhdfbcalhflpbdipkjjkoimeeod";
const gumroad_api = "https://api.gumroad.com/v2/licenses";
const product_id = "D-1vxIJJlbq1sZUhTpz70A==";

function log(message, type = "default") {
	const colorMap = {
		default: "#555555",
		success: "#48d17e",
		warning: "#f0a500",
		error: "#ff0000",
		update: "#00aaff",
	};
	const color = colorMap[type] || colorMap.default;
	const time = new Date().toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	console.log(
		`%c[${time}] - [${type.toUpperCase()}] - ${message}`,
		`color: ${color}; font-weight: bold;`,
	);
}

function chromeSet(data) {
	return new Promise((resolve, reject) => {
		chrome.storage.local.set(data, () => {
			if (chrome.runtime.lastError)
				return reject(chrome.runtime.lastError);
			resolve();
		});
	});
}

function chromeGet(keys) {
	return new Promise((resolve, reject) => {
		chrome.storage.local.get(keys, (items) => {
			if (chrome.runtime.lastError)
				return reject(chrome.runtime.lastError);
			resolve(items);
		});
	});
}

async function set(value) {
	const logs = value?.control?.log;
	try {
		await chromeSet({ config: value });
		logs && log("[SET] Config data successfully set.", "success");
	} catch (err) {
		log(`[SET] Failed to set config data: ${err.message}`, "error");
		throw err;
	}
}

async function get() {
	try {
		const { config } = await chromeGet("config");
		const logs = config?.control?.log;
		logs && log("[GET] Config data successfully retrieved.", "success");
		return config || null;
	} catch (err) {
		log(`[GET] Error retrieving config data: ${err.message}`, "error");
		throw err;
	}
}

async function resetPro(config) {
	const logs = config?.control?.log;
	try {
		config.pro.key = "";
		config.pro.seats = 0;
		config.control.niche = "random";
		config.control.act = 0;
		config.schedule.mode = "m1";
		await set(config);
		logs &&
			log("[RESET PRO] - Pro membership reset successfully.", "success");
	} catch (error) {
		log(
			`[RESET PRO] - Error resetting Pro membership: ${error?.message}`,
			"error",
		);
	}
}

async function resetRuntime(config) {
	const logs = config?.control?.log;
	try {
		config.runtime.done = 0;
		config.runtime.total = 0;
		config.runtime.failed = 0;
		config.runtime.running = 0;
		config.runtime.rsaTab = null;
		config.runtime.mobile = 0;
		config.runtime.act = 0;
		await set(config);
		logs && log("[RESET RUNTIME] - Runtime reset successfully.", "success");
		return true;
	} catch (error) {
		log(
			`[RESET RUNTIME] - Error resetting runtime: ${error?.message}`,
			"error",
		);
		return false;
	}
}

async function verify(key, config, increment = true) {
	const logs = config?.control?.log;
	if (!navigator.onLine) {
		logs && log("[VERIFY] - No internet connection.", "error");
		return false;
	}
	try {
		const res = await fetch(gumroad_api + "/verify", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				product_id: product_id,
				license_key: key,
				increment_uses_count: increment,
			}),
		});
		if (!res.ok) {
			log(
				`[VERIFY] - Error verifying Pro membership: ${res.status} ${res.statusText}`,
				"error",
			);
			return false;
		}
		const result = await res.json().catch(() => null);
		const { purchase, success, uses } = result || {};
		if (!success) {
			log("[VERIFY] - License key is invalid", "error");
			return false;
		}
		if (purchase.test && chrome.runtime.id === ext_id) {
			await resetPro(config);
			log(
				`[VERIFY] Test purchase detected. Resetting Pro membership.`,
				"error",
			);
			return false;
		}
		logs && log(`-----Gumroad Response-----`, "update");
		logs && console.log(purchase);
		logs && log(`--------------------------`, "update");
		if (purchase.disputed && !purchase.dispute_won) {
			await resetPro(config);
			log(
				`[VERIFY] Purchase under dispute. Resetting Pro membership.`,
				"error",
			);
			return false;
		}
		if (purchase.subscription_ended_at || purchase.subscription_failed_at) {
			await resetPro(config);
			log(
				`[VERIFY] Subscription ended or payment failed. Resetting Pro membership.`,
				"error",
			);
			return false;
		}
		if (!increment && Number(uses) > Number(config?.pro?.seats + 1)) {
			await resetPro(config);
			log(
				`[VERIFY] License key has more uses than allowed. Resetting Pro membership.`,
				"error",
			);
			return false;
		}
		if (purchase.subscription_cancelled_at) {
			log(
				`[VERIFY] Subscription cancelled, still active till period ends.`,
				"warning",
			);
		}
		logs && log(`[VERIFY] Pro User verified successfully.`, "success");
		if (increment) {
			config.pro.key = key;
			config.pro.seats = uses;
			await set(config);
		}
		return true;
	} catch (error) {
		log(
			`[VERIFY] - Error verifying Pro membership: ${error?.message}`,
			"error",
		);
		return false;
	}
}

export { log, set, get, resetPro, resetRuntime, verify };
