import { logger } from "./logger";

export async function appendStudentToSheet(_data: {
  fullName: string;
  email: string;
  phone?: string | null;
  country?: string | null;
  ageRange?: string | null;
  educationLevel?: string | null;
  track?: string | null;
  circleName?: string | null;
  memorizeFrom?: string | null;
}): Promise<void> {
  logger.debug("Google Sheets not configured — skipping student append");
}

export async function appendVolunteerToSheet(_data: {
  fullName: string;
  email: string;
  role: string;
  phone?: string | null;
  country?: string | null;
  track?: string | null;
  circleName?: string | null;
}): Promise<void> {
  logger.debug("Google Sheets not configured — skipping volunteer append");
}
