
export interface ClientInfo {
  name: string;
  occupation: string;
  email: string;
  location: string;
  telephone: string;
}

export interface VehicleInfo {
  make: string;
  model: string;
  year: string;
  trim: string;
  odometer: string;
  vin?: string;
  batteryType?: 'OEM' | 'Manufacturer Refurb' | 'Third-Party Reman' | 'Unknown';
  destinationCountry?: string;
  hybridType?: string; 
  sourceCountry?: string;
  intendedUse?: string;
}

export interface ClarityImages {
  exterior?: string; // base64
  dashboard?: string; // base64
  engineBay?: string; // base64
  batteryIntake?: string; // base64
}

export interface ClarityInput {
  client: ClientInfo;
  vehicle: VehicleInfo;
  symptoms: string;
  diagnosticCodes: string;
  occurrence: 'cold' | 'warm' | 'hills' | 'traffic' | 'random';
  onset: 'sudden' | 'gradual';
  driveability: 'normal' | 'weak' | 'limp' | 'overheating';
  recentWork: string;
  images?: ClarityImages;
}

export interface RankedHypothesis {
  title: string;
  reasoning: string;
  confidence: 'High' | 'Medium' | 'Low';
}

export interface ClarityReport {
  id: string;
  timestamp: string;
  bottomLine: string;
  riskProfile: {
    band: 'Green' | 'Amber' | 'Red';
    label: string;
    positioning: string;
  };
  hypotheses: RankedHypothesis[];
  overallConfidence: 'High' | 'Medium' | 'Low';
  missingEvidence: string[];
  questionScript: string[];
  decisionOptions: Array<{ label: string; description: string }>;
  signatureFeature: {
    title: string;
    items: string[];
  }; 
  closingReflection: string;
}

export interface JudgmentInput {
  client: ClientInfo;
  vehicle: VehicleInfo;
  decisionType: 'Import Strategy' | 'Fleet Transition' | 'Infrastructure Planning' | 'Investment Risk' | 'Policy Alignment';
  subject: string;
  context: string;
  priorityConcerns: string;
  images?: ClarityImages;
}

export interface JudgmentReport {
  id: string;
  timestamp: string;
  title: string;
  advisorySource: {
    entity: string;
    yearsInBusiness: string;
  };
  decisionFrame: string;
  sections: {
    suitability: string;
    financialCalibration: {
      importDuty: string;
      levies: string;
      landedCostNote: string;
    };
    mechanicalInsight: string;
    logisticsAlert: string;
    skepticismNote: string;
    falseFixes: {
      title: string;
      items: string[];
    };
    redFlags: string[];
    unknowns: string[];
    verificationQuestions: string[];
    decisionSummary: {
      level: 'Low' | 'Moderate' | 'High';
      text: string;
    };
  };
  closingNote: string;
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  NEW_ANALYSIS = 'NEW_ANALYSIS',
  REPORT_VIEW = 'REPORT_VIEW',
  JUDGMENT_INTAKE = 'JUDGMENT_INTAKE',
  JUDGMENT_VIEW = 'JUDGMENT_VIEW',
  HISTORY = 'HISTORY',
  SETTINGS = 'SETTINGS',
  REGISTRY = 'REGISTRY'
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  ERROR = 'ERROR'
}

export interface SavedReport {
  id: string; // Unique ID for tracking drafts
  input: ClarityInput;
  report?: ClarityReport; 
  timestamp: string;
  status: 'pending' | 'completed' | 'failed';
}

export interface SavedJudgment {
  id: string; // Unique ID for tracking drafts
  input: JudgmentInput;
  report?: JudgmentReport;
  timestamp: string;
  status: 'pending' | 'completed' | 'failed';
}

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER'
}

export interface AuthUser {
  email: string;
  name: string;
  role: UserRole;
}
