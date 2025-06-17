chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	(async () => {
		try {
			switch (request.action) {
				case "login": {
					const mobile = request.mobile;
					if (mobile) {
						sendResponse({ success: true });
						
						// Enhanced mobile login detection
						const mclick = document.querySelector("#mHamburger, .hamburger, [data-bi-name='hamburger']");
						const mobileMenu = document.querySelector("#HBContent, .mobile-menu");
						
						if (mclick && !mobileMenu) {
							mclick.click();
							await delay(1000);
						}
						
						// Look for sign-in elements with multiple selectors
						const menuLink = document.querySelector(
							"#HBSignIn a[role='menuitem']:not([style*='display: none']), " +
							".signin-link:not([style*='display: none']), " +
							"[data-bi-name='signin']:not([style*='display: none'])"
						);
						
						// Check if already logged in
						const isLoggedIn = document.querySelector(
							"#id_n, .id_button, [data-bi-name='mecontrol'], " +
							".msame_Header_name, .user-info"
						);

						if (!isLoggedIn && menuLink && 
							(menuLink.href.includes("/fd/auth/signin") || 
							 menuLink.href.includes("login.microsoftonline.com"))) {
							await delay(1000);
							menuLink.click();
							console.log("Clicked mobile sign in link");
						} else if (isLoggedIn) {
							console.log("User already logged in on mobile");
						} else {
							console.log("No mobile login link found or user already logged in");
						}
					} else {
						sendResponse({ success: true });
						
						// Enhanced desktop login detection
						const click = document.querySelector(".b_clickarea, #id_s, .id_signin");
						const desktopMenu = document.querySelector("#rewid-f, .desktop-menu");
						
						if (click && !desktopMenu) {
							click.click();
							await delay(1000);
						}
						
						// Check for sign-in button on desktop
						const signInButton = document.querySelector(
							"#id_s, .id_signin, [data-bi-name='signin'], " +
							".signin-button, .sign-in-link"
						);
						
						// Check if already logged in
						const isLoggedIn = document.querySelector(
							"#id_n, .id_button, [data-bi-name='mecontrol'], " +
							".msame_Header_name, .user-info, #id_rh"
						);
						
						if (!isLoggedIn && signInButton) {
							await delay(500);
							signInButton.click();
							console.log("Clicked desktop sign in button");
						} else if (isLoggedIn) {
							console.log("User already logged in on desktop");
						} else {
							console.log("No desktop sign-in button found or user already logged in");
						}
					}
					break;
				}

				case "query": {
					const input = document.querySelector("#sb_form_q");
					if (input && input.value !== request.query) {
						sendResponse({ success: true });
						input.value = "";
						input.focus();
						
						// Add more realistic typing with variable delays
						for (const char of request.query) {
							input.value += char;
							input.dispatchEvent(new Event("input", { bubbles: true }));
							await delay(
								30 + Math.floor(Math.random() * 80),
								true,
							);
						}
						
						// Trigger additional events for better compatibility
						input.dispatchEvent(new Event("change", { bubbles: true }));
						input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
					} else {
						sendResponse({ success: true });
					}
					break;
				}

				case "perform": {
					const input = document.querySelector("#sb_form_q");

					if (!input) {
						sendResponse({
							success: false,
							message: "Input not found",
						});
						return;
					}

					input.value = request.query;
					input.focus();
					input.dispatchEvent(new Event("input", { bubbles: true }));
					input.dispatchEvent(new Event("change", { bubbles: true }));

					// Try multiple methods to submit the search
					const form = input.closest("form");
					const submitButton = document.querySelector(
						"#sb_form_go, .b_searchbox_submit, [type='submit']"
					);
					
					if (form) {
						await delay(500 + Math.random() * 500);
						
						// Try clicking submit button first
						if (submitButton && submitButton.offsetParent !== null) {
							submitButton.click();
							console.log("Clicked submit button");
						} else {
							// Fallback to form submission
							form.submit();
							console.log("Submitted form");
						}
						
						// Alternative: simulate Enter key press
						input.dispatchEvent(new KeyboardEvent("keydown", {
							key: "Enter",
							code: "Enter",
							keyCode: 13,
							bubbles: true
						}));
						
						sendResponse({ success: true });
					} else {
						sendResponse({
							success: false,
							message: "Form not found",
						});
					}
					break;
				}

				case "closePopups": {
					// Enhanced popup closing with multiple selectors
					const popupSelectors = [
						".dashboardPopUpPopUpCloseButton",
						".popup-close",
						".modal-close",
						"[data-bi-name='close']",
						".close-button",
						".dismiss-button"
					];
					
					let closed = false;
					for (const selector of popupSelectors) {
						const closeButton = document.querySelector(selector);
						if (closeButton && closeButton.offsetParent !== null) {
							closeButton.click();
							closed = true;
							console.log(`Closed popup with selector: ${selector}`);
							break;
						}
					}
					
					if (!closed) {
						console.log("No popup close button found");
					}
					
					sendResponse({ success: true });
					break;
				}

				default:
					console.warn(
						"Unknown content script action:",
						request.action,
					);
					sendResponse({
						success: false,
						message: "Unknown action.",
					});
					return;
			}
		} catch (err) {
			console.error("Content script action failed:", err);
			sendResponse({ success: false, message: err.message });
		}
	})();
	return true; // Keeps sendResponse alive for async
});

async function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}