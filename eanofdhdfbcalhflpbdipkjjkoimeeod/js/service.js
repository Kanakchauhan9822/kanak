import { log, set, get, resetRuntime, verify } from "/js/utils.js";
import { devices } from "/js/devices.js";
import "/js/stats.js";

let config = {
	search: { desk: 10, mob: 0, min: 15, max: 30 },
	schedule: { desk: 0, mob: 0, min: 15, max: 30, mode: "m1" },
	device: { name: "", ua: "", h: 844, w: 390, scale: 3 },
	control: { niche: "random", consent: 0, clear: 0, act: 0, log: 0 },
	runtime: { done: 0, total: 0, failed: 0, running: 0, rsaTab: null, mobile: 0, act: 0 },
	user: { country: "", countryCode: "", city: "" },
	pro: { key: "", seats: 0 }
};

// Global variables for search management
let searchQueue = [];
let isProcessingQueue = false;
let currentSearchTimeout = null;
let searchStartTime = null;

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
	const storedConfig = await get();
	if (storedConfig) {
		Object.assign(config, storedConfig);
	}
	await set(config);
	log("[INIT] Extension initialized", "success");
});

// Load config on startup
chrome.runtime.onStartup.addListener(async () => {
	const storedConfig = await get();
	if (storedConfig) {
		Object.assign(config, storedConfig);
	}
	log("[STARTUP] Extension started", "success");
});

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	handleMessage(request, sender, sendResponse);
	return true; // Keep message channel open for async responses
});

async function handleMessage(request, sender, sendResponse) {
	const logs = config?.control?.log;
	
	try {
		switch (request.action) {
			case "start":
				const startResult = await startSearches();
				sendResponse(startResult);
				break;
				
			case "stop":
				const stopResult = await stopSearches();
				sendResponse(stopResult);
				break;
				
			case "schedule":
				const scheduleResult = await startSchedule();
				sendResponse(scheduleResult);
				break;
				
			case "activity":
				const activityResult = await performActivities();
				sendResponse(activityResult);
				break;
				
			case "clearBrowsingData":
				const clearResult = await clearBrowsingData();
				sendResponse(clearResult);
				break;
				
			case "simulate":
				const simulateResult = await toggleSimulation();
				sendResponse(simulateResult);
				break;
				
			default:
				logs && log(`[MESSAGE] Unknown action: ${request.action}`, "warning");
				sendResponse({ success: false, message: "Unknown action" });
		}
	} catch (error) {
		logs && log(`[MESSAGE] Error handling ${request.action}: ${error.message}`, "error");
		sendResponse({ success: false, message: error.message });
	}
}

// Alarm handler for scheduled searches
chrome.alarms.onAlarm.addListener(async (alarm) => {
	const logs = config?.control?.log;
	
	if (alarm.name === "schedule") {
		logs && log("[ALARM] Scheduled search triggered", "update");
		await startSearches();
		
		// Reschedule based on mode
		if (config.schedule.mode === "m3") {
			const randomDelay = Math.floor(Math.random() * 150) + 300; // 5-7.5 minutes
			await chrome.alarms.create("schedule", {
				when: Date.now() + randomDelay * 1000
			});
		} else if (config.schedule.mode === "m4") {
			const randomDelay = Math.floor(Math.random() * 150) + 900; // 15-17.5 minutes
			await chrome.alarms.create("schedule", {
				when: Date.now() + randomDelay * 1000
			});
		}
	}
});

async function startSearches() {
	const logs = config?.control?.log;
	
	try {
		// Reload config
		const storedConfig = await get();
		if (storedConfig) {
			Object.assign(config, storedConfig);
		}
		
		if (config.runtime.running) {
			logs && log("[START] Searches already running", "warning");
			return { success: false, message: "Already running" };
		}
		
		// Calculate total searches needed
		const desktopSearches = config.search.desk || 0;
		const mobileSearches = config.search.mob || 0;
		const totalSearches = desktopSearches + mobileSearches;
		
		if (totalSearches === 0) {
			logs && log("[START] No searches configured", "warning");
			return { success: false, message: "No searches configured" };
		}
		
		// Reset runtime
		config.runtime = {
			done: 0,
			total: totalSearches,
			failed: 0,
			running: 1,
			rsaTab: null,
			mobile: 0,
			act: 0
		};
		
		await set(config);
		
		// Build search queue
		searchQueue = [];
		
		// Add desktop searches
		for (let i = 0; i < desktopSearches; i++) {
			searchQueue.push({ type: "desktop", index: i + 1 });
		}
		
		// Add mobile searches
		for (let i = 0; i < mobileSearches; i++) {
			searchQueue.push({ type: "mobile", index: i + 1 });
		}
		
		// Shuffle queue for more realistic behavior
		searchQueue = shuffleArray(searchQueue);
		
		searchStartTime = Date.now();
		logs && log(`[START] Starting ${totalSearches} searches (${desktopSearches} desktop, ${mobileSearches} mobile)`, "success");
		
		// Start processing queue
		processSearchQueue();
		
		return { success: true, message: "Searches started" };
		
	} catch (error) {
		logs && log(`[START] Error starting searches: ${error.message}`, "error");
		return { success: false, message: error.message };
	}
}

async function stopSearches() {
	const logs = config?.control?.log;
	
	try {
		// Clear any pending timeouts
		if (currentSearchTimeout) {
			clearTimeout(currentSearchTimeout);
			currentSearchTimeout = null;
		}
		
		// Clear search queue
		searchQueue = [];
		isProcessingQueue = false;
		
		// Update runtime
		config.runtime.running = 0;
		await set(config);
		
		// Close RSA tab if exists
		if (config.runtime.rsaTab) {
			try {
				await chrome.tabs.remove(config.runtime.rsaTab);
			} catch (e) {
				// Tab might already be closed
			}
			config.runtime.rsaTab = null;
		}
		
		// Detach debugger if attached
		try {
			await chrome.debugger.detach({ tabId: config.runtime.rsaTab });
		} catch (e) {
			// Debugger might not be attached
		}
		
		logs && log("[STOP] Searches stopped", "success");
		return { success: true, message: "Searches stopped" };
		
	} catch (error) {
		logs && log(`[STOP] Error stopping searches: ${error.message}`, "error");
		return { success: false, message: error.message };
	}
}

async function processSearchQueue() {
	const logs = config?.control?.log;
	
	if (isProcessingQueue || searchQueue.length === 0 || !config.runtime.running) {
		if (searchQueue.length === 0 && config.runtime.running) {
			// All searches completed
			await completeSearches();
		}
		return;
	}
	
	isProcessingQueue = true;
	
	try {
		const searchItem = searchQueue.shift();
		logs && log(`[QUEUE] Processing ${searchItem.type} search ${searchItem.index}`, "update");
		
		// Perform the search
		const result = await performSingleSearch(searchItem);
		
		// Update progress
		config.runtime.done++;
		if (!result.success) {
			config.runtime.failed++;
		}
		
		await set(config);
		
		// Calculate delay for next search
		const minDelay = (config.search.min || 15) * 1000; // Convert to milliseconds
		const maxDelay = (config.search.max || 30) * 1000;
		const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
		
		logs && log(`[QUEUE] Next search in ${delay/1000}s`, "update");
		
		// Schedule next search
		currentSearchTimeout = setTimeout(() => {
			isProcessingQueue = false;
			processSearchQueue();
		}, delay);
		
	} catch (error) {
		logs && log(`[QUEUE] Error processing queue: ${error.message}`, "error");
		isProcessingQueue = false;
		
		// Continue with next search after a short delay
		currentSearchTimeout = setTimeout(() => {
			processSearchQueue();
		}, 5000);
	}
}

async function performSingleSearch(searchItem) {
	const logs = config?.control?.log;
	
	try {
		// Generate search query
		const query = await generateSearchQuery();
		
		// Create or reuse tab
		let tab = await getOrCreateSearchTab();
		
		// Configure for mobile/desktop
		if (searchItem.type === "mobile") {
			await setupMobileSimulation(tab.id);
			config.runtime.mobile = 1;
		} else {
			await setupDesktopMode(tab.id);
			config.runtime.mobile = 0;
		}
		
		await set(config);
		
		// Navigate to Bing
		await chrome.tabs.update(tab.id, { url: "https://www.bing.com" });
		
		// Wait for page load
		await waitForTabLoad(tab.id);
		
		// Perform login if needed
		await chrome.tabs.sendMessage(tab.id, {
			action: "login",
			mobile: searchItem.type === "mobile"
		});
		
		// Wait a bit for login
		await delay(2000);
		
		// Close any popups
		await chrome.tabs.sendMessage(tab.id, { action: "closePopups" });
		
		// Perform search
		await chrome.tabs.sendMessage(tab.id, {
			action: "perform",
			query: query
		});
		
		// Wait for search to complete
		await delay(3000);
		
		logs && log(`[SEARCH] Completed ${searchItem.type} search: "${query}"`, "success");
		return { success: true };
		
	} catch (error) {
		logs && log(`[SEARCH] Failed ${searchItem.type} search: ${error.message}`, "error");
		return { success: false, error: error.message };
	}
}

async function getOrCreateSearchTab() {
	try {
		// Try to reuse existing tab
		if (config.runtime.rsaTab) {
			try {
				const tab = await chrome.tabs.get(config.runtime.rsaTab);
				return tab;
			} catch (e) {
				// Tab doesn't exist anymore
				config.runtime.rsaTab = null;
			}
		}
		
		// Create new tab
		const tab = await chrome.tabs.create({
			url: "https://www.bing.com",
			active: false
		});
		
		config.runtime.rsaTab = tab.id;
		await set(config);
		
		return tab;
		
	} catch (error) {
		throw new Error(`Failed to create search tab: ${error.message}`);
	}
}

async function setupMobileSimulation(tabId) {
	const logs = config?.control?.log;
	
	try {
		// Get random device if not set
		if (!config.device.name) {
			const randomDevice = devices[Math.floor(Math.random() * devices.length)];
			config.device = {
				name: randomDevice.name,
				ua: randomDevice.userAgent,
				h: randomDevice.height,
				w: randomDevice.width,
				scale: randomDevice.deviceScaleFactor
			};
			await set(config);
		}
		
		// Attach debugger
		await chrome.debugger.attach({ tabId }, "1.3");
		
		// Set user agent
		await chrome.debugger.sendCommand({ tabId }, "Network.setUserAgentOverride", {
			userAgent: config.device.ua
		});
		
		// Set device metrics
		await chrome.debugger.sendCommand({ tabId }, "Emulation.setDeviceMetricsOverride", {
			width: config.device.w,
			height: config.device.h,
			deviceScaleFactor: config.device.scale,
			mobile: true
		});
		
		logs && log(`[MOBILE] Simulation enabled: ${config.device.name}`, "update");
		
	} catch (error) {
		logs && log(`[MOBILE] Failed to setup simulation: ${error.message}`, "error");
		throw error;
	}
}

async function setupDesktopMode(tabId) {
	const logs = config?.control?.log;
	
	try {
		// Detach debugger to disable mobile simulation
		try {
			await chrome.debugger.detach({ tabId });
		} catch (e) {
			// Debugger might not be attached
		}
		
		logs && log("[DESKTOP] Desktop mode enabled", "update");
		
	} catch (error) {
		logs && log(`[DESKTOP] Failed to setup desktop mode: ${error.message}`, "error");
		throw error;
	}
}

async function generateSearchQuery() {
	const logs = config?.control?.log;
	
	try {
		// Import queries dynamically
		const { queries } = await import("/js/queries.js");
		
		const niche = config.control.niche || "random";
		let selectedQueries;
		
		if (niche === "random") {
			// Get all queries from all niches
			const allQueries = Object.values(queries).flat();
			selectedQueries = allQueries;
		} else {
			selectedQueries = queries[niche] || queries.random;
		}
		
		// Select random query
		const query = selectedQueries[Math.floor(Math.random() * selectedQueries.length)];
		
		// Add some randomization
		const variations = [
			query,
			`${query} 2024`,
			`${query} latest`,
			`${query} news`,
			`${query} info`,
			`best ${query}`,
			`${query} guide`,
			`${query} tips`
		];
		
		const finalQuery = variations[Math.floor(Math.random() * variations.length)];
		
		logs && log(`[QUERY] Generated: "${finalQuery}" (niche: ${niche})`, "update");
		return finalQuery;
		
	} catch (error) {
		logs && log(`[QUERY] Error generating query: ${error.message}`, "error");
		// Fallback to simple random query
		const fallbackQueries = ["news", "weather", "sports", "technology", "science"];
		return fallbackQueries[Math.floor(Math.random() * fallbackQueries.length)];
	}
}

async function waitForTabLoad(tabId, timeout = 30000) {
	return new Promise((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			reject(new Error("Tab load timeout"));
		}, timeout);
		
		const checkTab = async () => {
			try {
				const tab = await chrome.tabs.get(tabId);
				if (tab.status === "complete") {
					clearTimeout(timeoutId);
					resolve();
				} else {
					setTimeout(checkTab, 500);
				}
			} catch (error) {
				clearTimeout(timeoutId);
				reject(error);
			}
		};
		
		checkTab();
	});
}

async function completeSearches() {
	const logs = config?.control?.log;
	
	try {
		const endTime = Date.now();
		const totalTime = Math.round((endTime - searchStartTime) / 1000);
		const minutes = Math.floor(totalTime / 60);
		const seconds = totalTime % 60;
		
		config.runtime.running = 0;
		await set(config);
		
		logs && log(`[COMPLETE] All searches completed in ${minutes}m ${seconds}s`, "success");
		
		// Perform activities if enabled
		if (config.control.act) {
			await performActivities();
		}
		
		// Clean up
		if (config.runtime.rsaTab) {
			try {
				await chrome.tabs.remove(config.runtime.rsaTab);
			} catch (e) {
				// Tab might already be closed
			}
			config.runtime.rsaTab = null;
		}
		
		// Detach debugger
		try {
			await chrome.debugger.detach({ tabId: config.runtime.rsaTab });
		} catch (e) {
			// Debugger might not be attached
		}
		
		await set(config);
		
	} catch (error) {
		logs && log(`[COMPLETE] Error completing searches: ${error.message}`, "error");
	}
}

async function startSchedule() {
	const logs = config?.control?.log;
	
	try {
		const storedConfig = await get();
		if (storedConfig) {
			Object.assign(config, storedConfig);
		}
		
		if (config.runtime.running) {
			return await stopSearches();
		}
		
		// Set schedule values
		config.search.desk = config.schedule.desk;
		config.search.mob = config.schedule.mob;
		config.search.min = config.schedule.min;
		config.search.max = config.schedule.max;
		
		await set(config);
		
		return await startSearches();
		
	} catch (error) {
		logs && log(`[SCHEDULE] Error starting schedule: ${error.message}`, "error");
		return { success: false, message: error.message };
	}
}

async function performActivities() {
	const logs = config?.control?.log;
	
	try {
		config.runtime.act = 1;
		await set(config);
		
		// Create tab for activities
		const tab = await chrome.tabs.create({
			url: "https://rewards.bing.com",
			active: false
		});
		
		await waitForTabLoad(tab.id);
		
		// Simple activity simulation - just visit the rewards page
		await delay(5000);
		
		// Close tab
		await chrome.tabs.remove(tab.id);
		
		config.runtime.act = 0;
		await set(config);
		
		logs && log("[ACTIVITY] Activities completed", "success");
		return { success: true };
		
	} catch (error) {
		config.runtime.act = 0;
		await set(config);
		logs && log(`[ACTIVITY] Error performing activities: ${error.message}`, "error");
		return { success: false, message: error.message };
	}
}

async function clearBrowsingData() {
	const logs = config?.control?.log;
	
	try {
		await chrome.browsingData.remove({
			origins: ["https://www.bing.com", "https://bing.com"]
		}, {
			cache: true,
			cookies: true,
			history: true,
			localStorage: true,
			sessionStorage: true
		});
		
		logs && log("[CLEAR] Bing browsing data cleared", "success");
		return { success: true };
		
	} catch (error) {
		logs && log(`[CLEAR] Error clearing browsing data: ${error.message}`, "error");
		return { success: false, message: error.message };
	}
}

async function toggleSimulation() {
	const logs = config?.control?.log;
	
	try {
		// Create or get active tab
		const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
		let tabId = tabs[0]?.id;
		
		if (!tabId) {
			const tab = await chrome.tabs.create({ url: "https://www.bing.com" });
			tabId = tab.id;
			await waitForTabLoad(tabId);
		}
		
		// Toggle simulation
		try {
			await chrome.debugger.detach({ tabId });
			logs && log("[SIMULATE] Mobile simulation disabled", "update");
		} catch (e) {
			// Not attached, so attach
			await setupMobileSimulation(tabId);
			logs && log("[SIMULATE] Mobile simulation enabled", "update");
		}
		
		return { success: true };
		
	} catch (error) {
		logs && log(`[SIMULATE] Error toggling simulation: ${error.message}`, "error");
		return { success: false, message: error.message };
	}
}

// Utility functions
function shuffleArray(array) {
	const shuffled = [...array];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// Handle extension updates
chrome.runtime.onUpdateAvailable.addListener(() => {
	chrome.runtime.reload();
});

// Handle browser startup
chrome.runtime.onStartup.addListener(async () => {
	const storedConfig = await get();
	if (storedConfig) {
		Object.assign(config, storedConfig);
		
		// Auto-start if schedule mode is set to startup
		if (storedConfig.schedule.mode === "m2") {
			setTimeout(() => {
				startSchedule();
			}, 10000); // Wait 10 seconds after startup
		}
	}
});