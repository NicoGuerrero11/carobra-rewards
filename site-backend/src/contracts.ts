export interface RegisterRequest {
  curp: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  password: string;
  confirm_password: string;
  postal_code: string;
  state: string;
  city: string;
  terms_accepted: boolean;
  terms_version: string;
}

export interface SiteRegisterRequest extends RegisterRequest {
  referral_token?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CustomerProfile {
  id: string;
  rewards_id: string;
  curp: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  postal_code: string;
  state: string;
  city: string;
  customer_status: string;
  onboarding_status: string;
}

export interface RegistrationResponse {
  customer: CustomerProfile;
  validation_id: string;
  validation_status: string;
}

export interface LoginResponse {
  customer: CustomerProfile;
  expires_at: string;
}

export interface ValidationStatusResponse {
  validation_id: string;
  customer_id: string;
  status: string;
  registered_at: string;
  next_checkpoint: string | null;
  next_checkpoint_at: string | null;
  last_checked_at: string | null;
  last_check_outcome: string | null;
}

export interface RewardsIdentityEvidence {
  customer_id: string;
  customer_status: string;
  validation_id: string;
  validation_status: string;
}

export type SiteErrorCode =
  | "duplicate_email"
  | "duplicate_curp"
  | "rewards_id_collision_exhausted"
  | "password_mismatch"
  | "terms_not_accepted"
  | "invalid_credentials"
  | "unauthenticated"
  | "rewards_not_eligible"
  | "api_unavailable";

export interface SiteErrorEnvelope {
  error: {
    code: SiteErrorCode;
    message: string;
  };
}
