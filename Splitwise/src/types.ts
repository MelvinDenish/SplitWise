export interface User {
  id: number | string;
  name: string;
  email: string;
  upiId?: string;
  createdAt?: string;
}

export interface Group {
  id: number | string;
  name: string;
  creatorId: number | string;
  memberIds: (number | string)[];
  members?: User[];
  createdAt: string;
  groupCode?: string;
  budgetLimit?: number;
  latestEventSummary?: string;
}

export interface Event {
  id: number | string;
  name: string;  // Backend field (EventResponse.name)
  title?: string; // Mock mode / legacy alias
  groupId: number | string;
  creatorId: number | string;
  createdAt: string;
  eventDate: string;
  weekNumber?: number;
  year?: number;
  totalAmount?: number;
}

export interface Share {
  id: number | string;
  subEventId: number | string;
  userId: number | string;
  userName?: string;
  userUpiId?: string;
  payerId: number | string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'CONFIRMED' | 'UNPAID' | 'MARKED_AS_PAID'; // Support both mock and real backend state strings
  markedAt?: string;
  confirmedAt?: string;
  transactionRef?: string;
  proofUrl?: string;
}

export interface SubEvent {
  id: number | string;
  description: string;
  totalAmount: number;
  payerId: number | string;
  eventId: number | string;
  eventCreatorId?: number | string;
  timestamp: string;
  subEventDate: string;
  weekNumber: number;
  year: number;
  shares?: Share[];
  sharers?: Share[];
  isRecurring?: boolean;
  recurringPeriod?: string;
  nextRunDate?: string;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

export interface NotificationItem {
  id: number | string;
  recipientId: number | string;
  senderId: number | string;
  senderName: string;
  groupId?: number | string;
  groupName?: string;
  shareId?: number | string;
  settlementId?: number | string;
  type: string;
  title: string;
  message: string;
  amount?: number;
  createdAt: string;
  readAt?: string;
}
