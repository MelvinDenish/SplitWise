package com.groupfinancetracker.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Sends via Brevo's HTTPS REST API rather than raw SMTP -- Render (like most PaaS hosts) blocks
 * outbound SMTP ports entirely to prevent abuse, so a normal JavaMailSender/SMTP connection times
 * out from there no matter which server or credentials it's pointed at. A plain HTTPS POST isn't
 * subject to that block. Brevo's single-sender verification (one-click email confirmation, no
 * domain/DNS needed) also lifts the "only your own inbox" sandbox restriction that Resend's
 * domain-only verification imposes, so this can send to any registered user.
 */
@Service
@Slf4j
public class EmailService {

    private static final URI BREVO_ENDPOINT = URI.create("https://api.brevo.com/v3/smtp/email");

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${app.mail.brevo-api-key}")
    private String brevoApiKey;

    @Value("${app.mail.from}")
    private String fromEmail;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    // ─── Welcome + Master Password ────────────────────────────────────────────

    @Async
    public void sendWelcomeWithMasterPassword(String name, String toEmail, String masterPassword) {
        send(toEmail, "Welcome to SplitWise — Your Master Password 🔑", buildWelcomeHtml(name, masterPassword));
    }

    // ─── Password Changed Notification ────────────────────────────────────────

    @Async
    public void sendPasswordChangedNotification(String name, String toEmail) {
        send(toEmail, "Your SplitWise Password Has Been Changed", buildPasswordChangedHtml(name));
    }

    @Async
    public void sendPaymentReminder(String name, String toEmail, String senderName, String groupName,
            BigDecimal amount, String message) {
        send(toEmail, "SplitWise payment reminder from " + senderName,
                buildPaymentReminderHtml(name, senderName, groupName, amount, message));
    }

    // ─── Brevo HTTPS API call ──────────────────────────────────────────────────

    private void send(String toEmail, String subject, String html) {
        try {
            String body = objectMapper.writeValueAsString(Map.of(
                    "sender", Map.of("email", fromEmail, "name", "SplitWise"),
                    "to", List.of(Map.of("email", toEmail)),
                    "subject", subject,
                    "htmlContent", html));
            HttpRequest request = HttpRequest.newBuilder(BREVO_ENDPOINT)
                    .header("api-key", brevoApiKey)
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .timeout(Duration.ofSeconds(15))
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 == 2) {
                log.info("[Email] Sent to {} ({})", toEmail, subject);
            } else {
                log.error("[Email] Failed to send to {} ({}): HTTP {} {}", toEmail, subject,
                        response.statusCode(), response.body());
            }
        } catch (Exception e) {
            log.error("[Email] Failed to send to {} ({}): {}", toEmail, subject, e.getMessage(), e);
        }
    }

    // ─── HTML Templates ───────────────────────────────────────────────────────

    private String buildWelcomeHtml(String name, String masterPassword) {
        return """
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"></head>
            <body style="margin:0;padding:0;background:#f6f8fa;font-family:'Segoe UI',Arial,sans-serif;">
              <table width="100%%" cellpadding="0" cellspacing="0" style="background:#f6f8fa;padding:40px 0;">
                <tr><td align="center">
                  <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                    <!-- Header -->
                    <tr>
                      <td style="background:linear-gradient(135deg,#6366f1 0%%,#8b5cf6 100%%);padding:40px 48px;text-align:center;">
                        <div style="font-size:36px;margin-bottom:8px;">💸</div>
                        <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">Welcome to SplitWise!</h1>
                        <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">Your smart expense splitting companion</p>
                      </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                      <td style="padding:40px 48px;">
                        <p style="color:#374151;font-size:16px;margin:0 0 24px;">Hi <strong>%s</strong>,</p>
                        <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
                          Your account has been created successfully. Below is your <strong>Master Password</strong> — keep it safe! You'll need it to reset your login password if you ever forget it.
                        </p>
                        <!-- Master Password Box -->
                        <div style="background:#f0f4ff;border:2px dashed #6366f1;border-radius:12px;padding:24px;text-align:center;margin:0 0 28px;">
                          <p style="margin:0 0 8px;color:#6366f1;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Your Master Password</p>
                          <p style="margin:0;font-family:'Courier New',monospace;font-size:28px;font-weight:700;color:#1f2937;letter-spacing:4px;">%s</p>
                        </div>
                        <!-- Warning -->
                        <div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:16px 20px;margin:0 0 28px;">
                          <p style="margin:0;color:#92400e;font-size:14px;line-height:1.5;">
                            ⚠️ <strong>Save this now.</strong> This master password is emailed only once and is not stored anywhere in plain text. If you lose it, you will need to contact support.
                          </p>
                        </div>
                        <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 28px;">
                          To reset your password, visit the <strong>Forgot Password</strong> page on SplitWise and enter your email, this master password, and your new password.
                        </p>
                        <div style="text-align:center;">
                          <a href="%s/login" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">Go to SplitWise →</a>
                        </div>
                      </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                      <td style="background:#f9fafb;padding:24px 48px;text-align:center;border-top:1px solid #e5e7eb;">
                        <p style="margin:0;color:#9ca3af;font-size:12px;">© 2025 SplitWise. This is an automated email, please do not reply.</p>
                      </td>
                    </tr>
                  </table>
                </td></tr>
              </table>
            </body>
            </html>
            """.formatted(name, masterPassword, frontendUrl);
    }

    private String buildPasswordChangedHtml(String name) {
        return """
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"></head>
            <body style="margin:0;padding:0;background:#f6f8fa;font-family:'Segoe UI',Arial,sans-serif;">
              <table width="100%%" cellpadding="0" cellspacing="0" style="background:#f6f8fa;padding:40px 0;">
                <tr><td align="center">
                  <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                    <tr>
                      <td style="background:linear-gradient(135deg,#10b981 0%%,#059669 100%%);padding:40px 48px;text-align:center;">
                        <div style="font-size:36px;margin-bottom:8px;">✅</div>
                        <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Password Changed Successfully</h1>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:40px 48px;">
                        <p style="color:#374151;font-size:16px;margin:0 0 20px;">Hi <strong>%s</strong>,</p>
                        <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px;">
                          Your SplitWise password was successfully changed. You can now log in with your new password.
                        </p>
                        <div style="background:#ecfdf5;border-left:4px solid #10b981;border-radius:0 8px 8px 0;padding:16px 20px;margin:0 0 28px;">
                          <p style="margin:0;color:#065f46;font-size:14px;">
                            🔒 If you did <strong>not</strong> make this change, please contact support immediately.
                          </p>
                        </div>
                        <div style="text-align:center;">
                          <a href="%s/login" style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">Log In →</a>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="background:#f9fafb;padding:24px 48px;text-align:center;border-top:1px solid #e5e7eb;">
                        <p style="margin:0;color:#9ca3af;font-size:12px;">© 2025 SplitWise. This is an automated email, please do not reply.</p>
                      </td>
                    </tr>
                  </table>
                </td></tr>
              </table>
            </body>
            </html>
            """.formatted(name, frontendUrl);
    }

    private String buildPaymentReminderHtml(String name, String senderName, String groupName,
            BigDecimal amount, String message) {
        return """
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"></head>
            <body style="margin:0;padding:0;background:#f6f8fa;font-family:'Segoe UI',Arial,sans-serif;">
              <table width="100%%" cellpadding="0" cellspacing="0" style="background:#f6f8fa;padding:40px 0;">
                <tr><td align="center">
                  <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                    <tr>
                      <td style="background:linear-gradient(135deg,#6366f1 0%%,#14b8a6 100%%);padding:36px 48px;text-align:center;">
                        <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Payment Reminder</h1>
                        <p style="margin:8px 0 0;color:rgba(255,255,255,0.88);font-size:15px;">%s sent you a SplitWise reminder</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:36px 48px;">
                        <p style="color:#374151;font-size:16px;margin:0 0 18px;">Hi <strong>%s</strong>,</p>
                        <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 22px;">
                          You have an outstanding payment of <strong>₹%s</strong> in <strong>%s</strong>.
                        </p>
                        <div style="background:#f0fdfa;border-left:4px solid #14b8a6;border-radius:0 8px 8px 0;padding:16px 20px;margin:0 0 28px;">
                          <p style="margin:0;color:#115e59;font-size:14px;line-height:1.5;">%s</p>
                        </div>
                        <div style="text-align:center;">
                          <a href="%s/login" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#14b8a6);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">Open SplitWise</a>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="background:#f9fafb;padding:24px 48px;text-align:center;border-top:1px solid #e5e7eb;">
                        <p style="margin:0;color:#9ca3af;font-size:12px;">© 2025 SplitWise. This is an automated reminder.</p>
                      </td>
                    </tr>
                  </table>
                </td></tr>
              </table>
            </body>
            </html>
            """.formatted(senderName, name, amount, groupName, message, frontendUrl);
    }
}
