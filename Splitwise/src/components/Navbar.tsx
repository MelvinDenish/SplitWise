import { Bell, Check, User, LogOut, Wallet } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { notificationAPI } from '../lib/api';
import { NotificationItem } from '../types';

export const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const unreadCount = notifications.filter((item) => !item.readAt).length;

  useEffect(() => {
    if (!user) return;
    notificationAPI.list()
      .then((res) => setNotifications(res.data || []))
      .catch(() => setNotifications([]));
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const markRead = async (notificationId: string | number) => {
    try {
      const res = await notificationAPI.markRead(notificationId);
      setNotifications((items) => items.map((item) => item.id === notificationId ? res.data : item));
    } catch {
      // Keep the dropdown usable even if a read receipt fails.
    }
  };

  return (
    <nav className="bg-white dark:bg-gray-800 shadow-md transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/dashboard')}>
            <Wallet className="w-8 h-8 text-primary-600" />
            <span className="text-xl font-bold text-gray-900 dark:text-white">SplitWise</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200"
                title="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowNotifications(false)} />
                  <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 rounded-lg shadow-lg z-20 border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">Notifications</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{unreadCount} unread reminder{unreadCount === 1 ? '' : 's'}</p>
                    </div>
                    {notifications.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400 text-center">No reminders yet.</p>
                    ) : (
                      <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                        {notifications.slice(0, 8).map((item) => (
                          <div key={item.id} className={`px-4 py-3 ${item.readAt ? '' : 'bg-primary-50/70 dark:bg-primary-950/20'}`}>
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.title}</p>
                                <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">{item.message}</p>
                                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                                  {new Date(item.createdAt).toLocaleString()}
                                </p>
                              </div>
                              {!item.readAt && (
                                <button
                                  onClick={() => markRead(item.id)}
                                  className="p-1.5 rounded-md text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/30"
                                  title="Mark as read"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
                  <span className="text-white font-semibold text-sm">
                    {user?.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 hidden sm:block">
                  {user?.name}
                </span>
              </button>

              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg py-1 z-20 border border-gray-200 dark:border-gray-700">
                    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
                    </div>
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        navigate('/profile');
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <User className="w-4 h-4" />
                      Profile
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};
