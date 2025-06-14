chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	(async () => {
		try {
			switch (request.action) {
				case "login": {
					const mobile = request.mobile;
					if (mobile) {
						sendResponse({ success: true });
						const mclick = document.querySelector("#mHamburger");
						const mobileMenu = document.querySelector("#HBContent");
						if (mclick && !mobileMenu) mclick.click();
						const menuLink = document.querySelector(
							"#HBSignIn a[role='menuitem']:not([style*='display: none'])",
						);
						const isLoggedIn =
							menuLink &&
							menuLink.href.includes("account.microsoft.com");

						if (
							!isLoggedIn &&
							menuLink &&
							menuLink.href.includes("/fd/auth/signin")
						) {
							await delay(1000);
							menuLink.click();
							console.log("Clicked sign in link");
						} else {
							console.log(
								"User already logged in or no login link",
							);
						}
					} else {
						sendResponse({ success: true });
						const click = document.querySelector(".b_clickarea");
						const desktopMenu = document.querySelector("#rewid-f");
						if (click && !desktopMenu) click.click();
					}
					break;
				}

				case "query": {
					const input = document.querySelector("#sb_form_q");
					if (input && input.value !== request.query) {
						sendResponse({ success: true });
						input.value = "";
						for (const char of request.query) {
							input.value += char;
							await delay(
								50 + Math.floor(Math.random() * 50),
								true,
							);
						}
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

					const form = input.closest("form");
					if (form) {
						await delay(1000);
						form.submit();
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
					const close = document.querySelector(
						".dashboardPopUpPopUpCloseButton",
					);
					if (close) {
						close.click();
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
