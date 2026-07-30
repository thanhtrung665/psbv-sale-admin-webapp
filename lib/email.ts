import nodemailer from "nodemailer";
import { prisma } from "./prisma";

export interface SendEmailOptions {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
}

export async function sendEmail({ to, cc, subject, html }: SendEmailOptions) {
  const config = await prisma.aiConfig.findFirst({ where: { name: "core" } });
  
  if (!config?.resendApiKey) {
    throw new Error("Vui lòng cấu hình Resend API Key trong mục Cấu hình AI.");
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.resend.com",
    port: 465,
    secure: true,
    auth: {
      user: "resend",
      pass: config.resendApiKey,
    },
  });

  const mailOptions = {
    from: "PSBV Sales Agent <onboarding@resend.dev>", // Should be replaced with verified domain in production
    to,
    cc,
    subject,
    html,
  };

  return await transporter.sendMail(mailOptions);
}
