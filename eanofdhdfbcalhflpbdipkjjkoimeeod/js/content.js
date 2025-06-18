chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	(async () => {
		try {
			switch (request.action) {
				case "login": {
					const mobile = request.mobile;
					sendResponse({ success: true });
					
					if (mobile) {
						// Enhanced mobile login detection with faster execution
						const mclick = document.querySelector("#mHamburger, .hamburger, [data-bi-name='hamburger']");
						if (mclick && !document.querySelector("#HBContent, .mobile-menu")) {
							mclick.click();
							await delay(500); // Reduced delay
						}
						
						const menuLink = document.querySelector(
							"#HBSignIn a[role='menuitem']:not([style*='display: none']), " +
							".signin-link:not([style*='display: none']), " +
							"[data-bi-name='signin']:not([style*='display: none'])"
						);
						
						const isLoggedIn = document.querySelector(
							"#id_n, .id_button, [data-bi-name='mecontrol'], " +
							".msame_Header_name, .user-info"
						);

						if (!isLoggedIn && menuLink && 
							(menuLink.href.includes("/fd/auth/signin") || 
							 menuLink.href.includes("login.microsoftonline.com"))) {
							await delay(300); // Reduced delay
							menuLink.click();
						}
					} else {
						// Enhanced desktop login with faster execution
						const click = document.querySelector(".b_clickarea, #id_s, .id_signin");
						if (click && !document.querySelector("#rewid-f, .desktop-menu")) {
							click.click();
							await delay(300); // Reduced delay
						}
						
						const signInButton = document.querySelector(
							"#id_s, .id_signin, [data-bi-name='signin'], " +
							".signin-button, .sign-in-link"
						);
						
						const isLoggedIn = document.querySelector(
							"#id_n, .id_button, [data-bi-name='mecontrol'], " +
							".msame_Header_name, .user-info, #id_rh"
						);
						
						if (!isLoggedIn && signInButton) {
							await delay(200); // Reduced delay
							signInButton.click();
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
						
						// Faster typing simulation
						for (const char of request.query) {
							input.value += char;
							input.dispatchEvent(new Event("input", { bubbles: true }));
							await delay(10 + Math.floor(Math.random() * 20)); // Much faster typing
						}
						
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

					// Faster form submission
					const form = input.closest("form");
					const submitButton = document.querySelector(
						"#sb_form_go, .b_searchbox_submit, [type='submit']"
					);
					
					if (form) {
						await delay(100); // Much reduced delay
						
						if (submitButton && submitButton.offsetParent !== null) {
							submitButton.click();
						} else {
							form.submit();
						}
						
						// Quick Enter key simulation
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
					// Faster popup closing
					const popupSelectors = [
						".dashboardPopUpPopUpCloseButton",
						".popup-close",
						".modal-close",
						"[data-bi-name='close']",
						".close-button",
						".dismiss-button"
					];
					
					for (const selector of popupSelectors) {
						const closeButton = document.querySelector(selector);
						if (closeButton && closeButton.offsetParent !== null) {
							closeButton.click();
							break;
						}
					}
					
					sendResponse({ success: true });
					break;
				}

				default:
					sendResponse({
						success: false,
						message: "Unknown action.",
					});
					return;
			}
		} catch (err) {
			sendResponse({ success: false, message: err.message });
		}
	})();
	return true;
});

async function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}