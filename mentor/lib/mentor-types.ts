export type MentorSubject = {
  id: string;
  name: string;
};

export type MentorProfile = {
  id: string;
  userId: string;
  fullName: string;
  headline: string | null;
  bio: string | null;
  profileImageUrl: string | null;
  experienceYears: number;
  isActive: boolean;
  subjects: MentorSubject[];
  createdAt: string;
  updatedAt: string;
};

export type MentorTokens = {
  accessToken: string;
  refreshToken: string;
};
