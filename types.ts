
export interface TargetLead {
  id: string;
  query: string;
  lastGenerated?: string;
}

export interface OutreachOutputs {
  researchSummary: string;
  contactDetails?: {
    email?: string;
    linkedIn?: string;
    twitter?: string;
  };
  formalEmail: {
    subject: string;
    body: string;
  };
  socialMessage: string;
  elevatorPitch: string;
  sources?: Array<{ web: { uri: string; title: string } }>;
}

export enum GenerationStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
