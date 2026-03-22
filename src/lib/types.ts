export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatRequest = {
  message: string;
  history?: ChatMessage[];
  bulletId?: string | null;
};

export type ChatResponse = {
  message: string;
  error?: string;
};

export type JobFitRequest = {
  jobDescription: string;
};

export type JobFitResponse = {
  message: string;
  error?: string;
};

export type ResumeBullet = {
  id: string;
  text: string;
  story?: string;
};

export type ResumeExperience = {
  company: string;
  role: string;
  start: string;
  end: string;
  bullets: ResumeBullet[];
};

export type ResumePatent = {
  title: string;
  number: string;
  year: string;
  description: string;
};

export type ResumeData = {
  name: string;
  title: string;
  contact: {
    email: string;
    phone: string;
  };
  summary: string;
  experience: ResumeExperience[];
  suggestedQuestions: string[];
  patents?: ResumePatent[];
  links?: Array<{ label: string; url: string }>;
};
