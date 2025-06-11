async function checkBalance() {
  const email = document.getElementById("balanceEmail").value.trim();
  const resultDiv = document.getElementById("balanceResult");

  if (!email) {
    resultDiv.style.display = "block";
    resultDiv.style.backgroundColor = "#fff3cd";
    resultDiv.style.color = "#856404";
    resultDiv.innerHTML = "⚠ Please enter an email address";
    return;
  }

  resultDiv.style.display = "block";
  resultDiv.style.backgroundColor = "#f8f9fa";
  resultDiv.style.color = "#666";
  resultDiv.innerHTML = "🔄 Checking...";

  try {
    const response = await fetch("/api/check-balance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: email }),
    });

    const data = await response.json();

    if (data.totalBalance > 0) {
      resultDiv.style.backgroundColor = "#f8d7da";
      resultDiv.style.color = "#721c24";
      resultDiv.innerHTML = `
          <strong>⚠ Outstanding Balance: $${data.totalBalance.toFixed(
            2
          )}</strong><br>
          <small>You have ${data.orderCount} order${
        data.orderCount > 1 ? "s" : ""
      } with unpaid balance${
        data.orderCount > 1 ? "s" : ""
      }. This amount will be added to your new order total.</small>
        `;
    } else if (data.totalBalance < 0) {
      resultDiv.style.backgroundColor = "#d4edda";
      resultDiv.style.color = "#155724";
      resultDiv.innerHTML = `
          <strong>✓ Credit Available: $${Math.abs(data.totalBalance).toFixed(
            2
          )}</strong><br>
          <small>You have credits that will be automatically applied to your new order.</small>
        `;
    } else {
      resultDiv.style.backgroundColor = "#d4edda";
      resultDiv.style.color = "#155724";
      resultDiv.innerHTML = `
          <strong>✓ No Outstanding Balance</strong><br>
          <small>All previous orders are fully paid.</small>
        `;
    }
  } catch (error) {
    resultDiv.style.backgroundColor = "#f8d7da";
    resultDiv.style.color = "#721c24";
    resultDiv.innerHTML = "❌ Error checking balance. Please try again.";
  }
}

// Auto-fill email in order form when balance is checked
document.getElementById("balanceEmail").addEventListener("change", function () {
  const orderEmailField = document.querySelector('input[name="email"]');
  if (orderEmailField && this.value.trim()) {
    orderEmailField.value = this.value.trim();
  }
});
