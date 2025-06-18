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

// Global variables for optimized search management
let searchQueue = [];
let isProcessingQueue = false;
let searchStartTime = null;
let activeTabs = new Map(); // Track active tabs for reuse
let concurrentSearches = 0;
const MAX_CONCURRENT_SEARCHES = 3; // Limit concurrent searches per profile

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
	return true;
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
			const randomDelay = Math.floor(Math.random() * 150) + 300;
			await chrome.alarms.create("schedule", {
				when: Date.now() + randomDelay * 1000
			});
		} else if (config.schedule.mode === "m4") {
			const randomDelay = Math.floor(Math.random() * 150) + 900;
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
		
		// Build optimized search queue
		searchQueue = [];
		
		// Add desktop searches
		for (let i = 0; i < desktopSearches; i++) {
			searchQueue.push({ 
				type: "desktop", 
				index: i + 1,
				id: `desktop_${i + 1}`,
				priority: Math.random() // For shuffling
			});
		}
		
		// Add mobile searches
		for (let i = 0; i < mobileSearches; i++) {
			searchQueue.push({ 
				type: "mobile", 
				index: i + 1,
				id: `mobile_${i + 1}`,
				priority: Math.random() // For shuffling
			});
		}
		
		// Shuffle queue for realistic behavior
		searchQueue.sort((a, b) => a.priority - b.priority);
		
		searchStartTime = Date.now();
		concurrentSearches = 0;
		
		logs && log(`[START] Starting ${totalSearches} searches (${desktopSearches} desktop, ${mobileSearches} mobile)`, "success");
		
		// Pre-create tabs for better performance
		await preCreateTabs();
		
		// Start processing queue with parallel execution
		processSearchQueueParallel();
		
		return { success: true, message: "Searches started" };
		
	} catch (error) {
		logs && log(`[START] Error starting searches: ${error.message}`, "error");
		return { success: false, message: error.message };
	}
}

async function stopSearches() {
	const logs = config?.control?.log;
	
	try {
		// Clear search queue
		searchQueue = [];
		isProcessingQueue = false;
		concurrentSearches = 0;
		
		// Update runtime
		config.runtime.running = 0;
		await set(config);
		
		// Close all active tabs
		for (const [tabId, tabInfo] of activeTabs) {
			try {
				await chrome.tabs.remove(tabId);
				// Detach debugger if attached
				try {
					await chrome.debugger.detach({ tabId });
				} catch (e) {
					// Debugger might not be attached
				}
			} catch (e) {
				// Tab might already be closed
			}
		}
		
		activeTabs.clear();
		
		logs && log("[STOP] Searches stopped", "success");
		return { success: true, message: "Searches stopped" };
		
	} catch (error) {
		logs && log(`[STOP] Error stopping searches: ${error.message}`, "error");
		return { success: false, message: error.message };
	}
}

async function preCreateTabs() {
	const logs = config?.control?.log;
	
	try {
		// Create 2-3 tabs for reuse (desktop and mobile)
		const desktopTab = await chrome.tabs.create({
			url: "https://www.bing.com",
			active: false
		});
		
		const mobileTab = await chrome.tabs.create({
			url: "https://www.bing.com", 
			active: false
		});
		
		activeTabs.set(desktopTab.id, { type: "desktop", inUse: false });
		activeTabs.set(mobileTab.id, { type: "mobile", inUse: false });
		
		// Setup mobile simulation on mobile tab
		await setupMobileSimulation(mobileTab.id);
		
		logs && log("[TABS] Pre-created tabs for better performance", "update");
		
	} catch (error) {
		logs && log(`[TABS] Error pre-creating tabs: ${error.message}`, "error");
	}
}

async function processSearchQueueParallel() {
	const logs = config?.control?.log;
	
	if (!config.runtime.running || searchQueue.length === 0) {
		if (searchQueue.length === 0 && config.runtime.running && concurrentSearches === 0) {
			await completeSearches();
		}
		return;
	}
	
	// Process multiple searches concurrently
	while (searchQueue.length > 0 && concurrentSearches < MAX_CONCURRENT_SEARCHES && config.runtime.running) {
		const searchItem = searchQueue.shift();
		concurrentSearches++;
		
		// Process search without waiting
		processSingleSearchAsync(searchItem);
		
		// Small delay between starting concurrent searches
		await delay(100);
	}
	
	// Schedule next batch if queue not empty
	if (searchQueue.length > 0 && config.runtime.running) {
		setTimeout(() => {
			processSearchQueueParallel();
		}, 1000);
	}
}

async function processSingleSearchAsync(searchItem) {
	const logs = config?.control?.log;
	
	try {
		logs && log(`[QUEUE] Processing ${searchItem.type} search ${searchItem.index}`, "update");
		
		// Calculate delay BEFORE search (more efficient)
		const minDelay = (config.search.min || 15) * 1000;
		const maxDelay = (config.search.max || 30) * 1000;
		const delay_time = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
		
		// Perform the search
		const result = await performSingleSearchOptimized(searchItem);
		
		// Update progress
		config.runtime.done++;
		if (!result.success) {
			config.runtime.failed++;
		}
		
		await set(config);
		
		// Apply delay after search completion
		await delay(delay_time);
		
		concurrentSearches--;
		
		// Continue processing if more searches available
		if (searchQueue.length > 0 && config.runtime.running) {
			processSearchQueueParallel();
		} else if (searchQueue.length === 0 && concurrentSearches === 0 && config.runtime.running) {
			await completeSearches();
		}
		
	} catch (error) {
		logs && log(`[QUEUE] Error processing search: ${error.message}`, "error");
		concurrentSearches--;
		config.runtime.failed++;
		await set(config);
		
		// Continue processing
		if (searchQueue.length > 0 && config.runtime.running) {
			setTimeout(() => {
				processSearchQueueParallel();
			}, 2000);
		}
	}
}

async function performSingleSearchOptimized(searchItem) {
	const logs = config?.control?.log;
	
	try {
		// Generate search query
		const query = await generateSearchQuery();
		
		// Get or reuse tab efficiently
		const tab = await getOptimizedTab(searchItem.type);
		
		// Quick navigation to Bing (reuse existing connection)
		await chrome.tabs.update(tab.id, { url: `https://www.bing.com/search?q=${encodeURIComponent(query)}` });
		
		// Reduced wait time for page load
		await waitForTabLoadOptimized(tab.id, 10000);
		
		// Minimal operations for faster completion
		try {
			// Quick login attempt (non-blocking)
			chrome.tabs.sendMessage(tab.id, {
				action: "login",
				mobile: searchItem.type === "mobile"
			}).catch(() => {}); // Ignore errors
			
			// Quick popup close (non-blocking)
			setTimeout(() => {
				chrome.tabs.sendMessage(tab.id, { action: "closePopups" }).catch(() => {});
			}, 500);
			
		} catch (e) {
			// Ignore content script errors
		}
		
		// Minimal wait for search completion
		await delay(1500);
		
		logs && log(`[SEARCH] Completed ${searchItem.type} search: "${query}"`, "success");
		return { success: true };
		
	} catch (error) {
		logs && log(`[SEARCH] Failed ${searchItem.type} search: ${error.message}`, "error");
		return { success: false, error: error.message };
	}
}

async function getOptimizedTab(searchType) {
	try {
		// Find available tab of the correct type
		for (const [tabId, tabInfo] of activeTabs) {
			if (tabInfo.type === searchType && !tabInfo.inUse) {
				tabInfo.inUse = true;
				
				// Release tab after use
				setTimeout(() => {
					if (activeTabs.has(tabId)) {
						activeTabs.get(tabId).inUse = false;
					}
				}, 5000);
				
				return await chrome.tabs.get(tabId);
			}
		}
		
		// Create new tab if none available
		const tab = await chrome.tabs.create({
			url: "https://www.bing.com",
			active: false
		});
		
		activeTabs.set(tab.id, { type: searchType, inUse: true });
		
		if (searchType === "mobile") {
			await setupMobileSimulation(tab.id);
		}
		
		// Release tab after use
		setTimeout(() => {
			if (activeTabs.has(tab.id)) {
				activeTabs.get(tab.id).inUse = false;
			}
		}, 5000);
		
		return tab;
		
	} catch (error) {
		throw new Error(`Failed to get optimized tab: ${error.message}`);
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
		
		// Attach debugger with timeout
		await Promise.race([
			chrome.debugger.attach({ tabId }, "1.3"),
			new Promise((_, reject) => setTimeout(() => reject(new Error("Debugger attach timeout")), 5000))
		]);
		
		// Set user agent and device metrics in parallel
		await Promise.all([
			chrome.debugger.sendCommand({ tabId }, "Network.setUserAgentOverride", {
				userAgent: config.device.ua
			}),
			chrome.debugger.sendCommand({ tabId }, "Emulation.setDeviceMetricsOverride", {
				width: config.device.w,
				height: config.device.h,
				deviceScaleFactor: config.device.scale,
				mobile: true
			})
		]);
		
		logs && log(`[MOBILE] Simulation enabled: ${config.device.name}`, "update");
		
	} catch (error) {
		logs && log(`[MOBILE] Failed to setup simulation: ${error.message}`, "error");
		// Don't throw error, continue without mobile simulation
	}
}

async function waitForTabLoadOptimized(tabId, timeout = 10000) {
	return new Promise((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			resolve(); // Don't reject, just continue
		}, timeout);
		
		const checkTab = async () => {
			try {
				const tab = await chrome.tabs.get(tabId);
				if (tab.status === "complete" || tab.url.includes("bing.com")) {
					clearTimeout(timeoutId);
					resolve();
				} else {
					setTimeout(checkTab, 200); // Faster checking
				}
			} catch (error) {
				clearTimeout(timeoutId);
				resolve(); // Don't reject, just continue
			}
		};
		
		checkTab();
	});
}

async function generateSearchQuery() {
	const logs = config?.control?.log;
	
	try {
		// Import queries dynamically
		const { queries } = await import("/js/queries.js");
		
		const niche = config.control.niche || "random";
		let selectedQueries;
		
		if (niche === "random") {
			const allQueries = Object.values(queries).flat();
			selectedQueries = allQueries;
		} else {
			selectedQueries = queries[niche] || queries.random;
		}
		
		// Select random query with simple variation
		const baseQuery = selectedQueries[Math.floor(Math.random() * selectedQueries.length)];
		const variations = [baseQuery, `${baseQuery} 2024`, `${baseQuery} latest`];
		const finalQuery = variations[Math.floor(Math.random() * variations.length)];
		
		return finalQuery;
		
	} catch (error) {
		// Fallback to simple queries
		const fallbackQueries = ["news", "weather", "sports", "technology", "science", "health", "travel", "food"];
		return fallbackQueries[Math.floor(Math.random() * fallbackQueries.length)];
	}
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
			setTimeout(() => {
				performActivities();
			}, 2000);
		}
		
		// Keep tabs open for potential reuse
		// Clean up will happen on next start or stop
		
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
		
		await waitForTabLoadOptimized(tab.id, 15000);
		
		// Simple activity simulation
		await delay(3000);
		
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
		const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
		let tabId = tabs[0]?.id;
		
		if (!tabId) {
			const tab = await chrome.tabs.create({ url: "https://www.bing.com" });
			tabId = tab.id;
			await waitForTabLoadOptimized(tabId);
		}
		
		try {
			await chrome.debugger.detach({ tabId });
			logs && log("[SIMULATE] Mobile simulation disabled", "update");
		} catch (e) {
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
		
		if (storedConfig.schedule.mode === "m2") {
			setTimeout(() => {
				startSchedule();
			}, 10000);
		}
	}
});