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
  timezone: string;
  subjects: MentorSubject[];
  createdAt: string;
  updatedAt: string;
};

export type MentorTokens = {
  accessToken: string;
  refreshToken: string;
};

export type MentorAvailabilitySlot = {
  id: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  createdAt: string;
  updatedAt: string;
};

export type MentorAvailability = {
  mentorProfileId: string;
  timezone: string;
  slots: MentorAvailabilitySlot[];
};

export type ReplaceMentorAvailabilityInput = {
  timezone: string;
  slots: Array<Pick<MentorAvailabilitySlot, 'dayOfWeek' | 'startMinute' | 'endMinute'>>;
};

export type MentorBooking = {
  id: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  mentorTimezone: string;
  localDate: string;
  localStartTime: string;
  localEndTime: string;
  createdAt: string;
  student: { fullName: string };
};
