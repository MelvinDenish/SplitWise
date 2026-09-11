import { useState, useEffect, FormEvent } from 'react';
import { Modal } from './Modal';
import { subEventAPI, eventAPI, groupAPI, receiptScannerAPI } from '../lib/api';
import { User } from '../types';
import { useToast } from './Toast';

interface CreateSubEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  eventId: string;
  /** When provided, the modal edits this expense instead of creating a new one. */
  editSubEvent?: any;
}

export const CreateSubEventModal = ({
  isOpen,
  onClose,
  onSuccess,
  eventId,
  editSubEvent,
}: CreateSubEventModalProps) => {
  const isEdit = !!editSubEvent;
  const [title, setTitle] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [splitType, setSplitType] = useState<'EQUAL' | 'CUSTOM'>('EQUAL');
  const [groupMembers, setGroupMembers] = useState<User[]>([]);
  const [selectedSharers, setSelectedSharers] = useState<(string | number)[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string | number, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringPeriod, setRecurringPeriod] = useState<string>('DAILY');
  const [payerId, setPayerId] = useState<string | number>('');
  const [subEventDate, setSubEventDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [receiptText, setReceiptText] = useState('');
  const [receiptPreview, setReceiptPreview] = useState('');
  const [receiptScan, setReceiptScan] = useState<any | null>(null);
  const [receiptAssignments, setReceiptAssignments] = useState<Record<number, string | number>>({});
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    const fetchEventData = async () => {
      try {
        const response = await eventAPI.getById(eventId);
        const groupResponse = await groupAPI.getById(response.data.groupId);
        const groupData = groupResponse.data;
        // GroupResponse embeds full member profiles now, so no separate GET /users call is needed.
        const members: User[] = groupData.members || [];
        const memberIdSet = new Set(members.map((m) => String(m.id)));
        setGroupMembers(members);
        // Default payer to current logged-in user if they are a member (create mode only)
        if (!isEdit) {
          const storedUser = localStorage.getItem('user');
          if (storedUser) {
            const currentUser = JSON.parse(storedUser);
            if (memberIdSet.has(String(currentUser.id))) {
              setPayerId(currentUser.id);
            } else if (members.length > 0) {
              setPayerId(members[0].id);
            }
          }
        }
      } catch (error) {
        showToast('Failed to load group members', 'error');
      }
    };

    if (isOpen) {
      fetchEventData();
    }
  }, [isOpen, eventId, isEdit]);

  // Pre-fill fields when editing (or reset when opening a fresh create).
  useEffect(() => {
    if (!isOpen) return;
    if (editSubEvent) {
      const sharers = editSubEvent.sharers || editSubEvent.shares || [];
      setTitle(editSubEvent.description || editSubEvent.title || '');
      setTotalAmount(String(editSubEvent.totalAmount ?? ''));
      setPayerId(editSubEvent.payerId ?? '');
      setSubEventDate((editSubEvent.subEventDate || new Date().toISOString().slice(0, 10)).slice(0, 10));
      setIsRecurring(!!editSubEvent.isRecurring);
      setRecurringPeriod(editSubEvent.recurringPeriod || 'MONTHLY');
      setSplitType('CUSTOM'); // preserve exact per-person amounts
      setSelectedSharers(sharers.map((s: any) => s.userId));
      setCustomAmounts(
        Object.fromEntries(sharers.map((s: any) => [s.userId, String(s.amount)]))
      );
    } else {
      setTitle('');
      setTotalAmount('');
      setSelectedSharers([]);
      setCustomAmounts({});
      setSplitType('EQUAL');
      setIsRecurring(false);
      setRecurringPeriod('DAILY');
      setReceiptText('');
      setReceiptPreview('');
      setReceiptScan(null);
      setReceiptAssignments({});
    }
  }, [isOpen, editSubEvent]);

  const toggleSharer = (userId: string | number) => {
    if (selectedSharers.includes(userId)) {
      setSelectedSharers(selectedSharers.filter((id) => id !== userId));
      const newCustomAmounts = { ...customAmounts };
      delete newCustomAmounts[userId];
      setCustomAmounts(newCustomAmounts);
    } else {
      setSelectedSharers([...selectedSharers, userId]);
    }
  };

  const handleCustomAmountChange = (userId: string | number, amount: string) => {
    setCustomAmounts({
      ...customAmounts,
      [userId]: amount,
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (selectedSharers.length === 0) {
      showToast('Please select at least one sharer', 'error');
      return;
    }

    if (!payerId) {
      showToast('Please select who paid', 'error');
      return;
    }

    if (splitType === 'CUSTOM') {
      const totalCustom = selectedSharers.reduce<number>(
        (sum, id) => sum + (parseFloat(customAmounts[id]) || 0),
        0
      );
      if (Math.abs(totalCustom - parseFloat(totalAmount)) > 0.01) {
        showToast('Custom amounts must add up to total amount', 'error');
        return;
      }
    }

    setIsLoading(true);
    try {
      const payload = {
        title,
        totalAmount: parseFloat(totalAmount),
        payerId,
        subEventDate,
        sharerIds: selectedSharers,
        splitType,
        customAmounts:
          splitType === 'CUSTOM'
            ? Object.fromEntries(
                Object.entries(customAmounts).map(([k, v]) => [k, parseFloat(v)])
              )
            : undefined,
        isRecurring,
        recurringPeriod: isRecurring ? recurringPeriod : undefined,
      };
      if (isEdit) {
        await subEventAPI.update(editSubEvent.id, payload);
        showToast('Payment updated successfully!', 'success');
      } else {
        await subEventAPI.create({ eventId, ...payload });
        showToast('Payment created successfully!', 'success');
      }
      onSuccess();
    } catch (error: any) {
      showToast(error.response?.data?.message || `Failed to ${isEdit ? 'update' : 'create'} payment`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReceiptUpload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setReceiptPreview(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const scanReceipt = async () => {
    if (!receiptText.trim()) {
      showToast('Paste receipt text before scanning', 'error');
      return;
    }
    setIsScanningReceipt(true);
    try {
      const res = await receiptScannerAPI.scan(receiptText, parseFloat(totalAmount) || undefined);
      setReceiptScan(res.data);
      if (res.data?.detectedTotal) setTotalAmount(String(res.data.detectedTotal));
      if (!title && res.data?.items?.[0]?.label) setTitle(res.data.items[0].label);
      showToast(res.data?.warning || 'Receipt parsed successfully', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to parse receipt', 'error');
    } finally {
      setIsScanningReceipt(false);
    }
  };

  const applyReceiptAssignments = () => {
    if (!receiptScan?.items?.length) return;
    const memberTotals: Record<string | number, number> = {};
    receiptScan.items.forEach((item: any, index: number) => {
      if (item.taxLike) return;
      const assignee = receiptAssignments[index];
      if (!assignee) return;
      memberTotals[assignee] = (memberTotals[assignee] || 0) + Number(item.amount || 0);
    });
    const selected = Object.keys(memberTotals);
    if (selected.length === 0) {
      showToast('Assign at least one receipt item to a member', 'error');
      return;
    }

    const subtotal = selected.reduce((sum, id) => sum + memberTotals[id], 0);
    const overhead = Number(receiptScan.tax || 0) + Number(receiptScan.tip || 0);
    const adjusted = Object.fromEntries(selected.map((id) => {
      const base = memberTotals[id];
      const extra = subtotal > 0 ? overhead * (base / subtotal) : overhead / selected.length;
      return [id, (base + extra).toFixed(2)];
    }));

    setSelectedSharers(selected);
    setCustomAmounts(adjusted);
    setSplitType('CUSTOM');
    setTotalAmount(String(receiptScan.detectedTotal || Object.values(adjusted).reduce((sum: number, v: any) => sum + Number(v), 0)));
    showToast('Receipt items applied as custom split', 'success');
  };

  const equalShare = selectedSharers.length > 0
    ? (parseFloat(totalAmount) || 0) / selectedSharers.length
    : 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Payment' : 'Create Payment'}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Payment Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="e.g., Lunch"
            required
          />
        </div>

        {!isEdit && (
          <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/20 space-y-3">
            <div>
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">AI Receipt Scanner</p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                Upload a photo for reference, paste receipt OCR/text, then assign parsed items to members.
              </p>
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleReceiptUpload(e.target.files?.[0])}
              className="block w-full text-xs text-blue-900 dark:text-blue-200"
            />
            {receiptPreview && (
              <img src={receiptPreview} alt="Receipt preview" className="max-h-40 rounded-lg border border-blue-100 dark:border-blue-900/40" />
            )}
            <textarea
              value={receiptText}
              onChange={(e) => setReceiptText(e.target.value)}
              rows={4}
              placeholder={'Paste receipt text, for example:\nPaneer Roll 180\nCoffee 90\nGST 13.50\nTotal 283.50'}
              className="w-full px-3 py-2 border rounded-lg text-xs bg-white dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={scanReceipt}
              disabled={isScanningReceipt}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold"
            >
              {isScanningReceipt ? 'Scanning…' : 'Extract Items'}
            </button>

            {receiptScan?.items?.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-blue-900 dark:text-blue-200">
                  <span>Total detected: ₹{Number(receiptScan.detectedTotal).toFixed(2)}</span>
                  <span>Tax/tip: ₹{(Number(receiptScan.tax || 0) + Number(receiptScan.tip || 0)).toFixed(2)}</span>
                </div>
                {receiptScan.items.map((item: any, index: number) => (
                  <div key={index} className="flex items-center gap-2 text-xs bg-white dark:bg-gray-800 rounded-lg p-2 border border-blue-100 dark:border-blue-900/40">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 dark:text-white">{item.label}</p>
                      <p className="text-gray-500 dark:text-gray-400">₹{Number(item.amount).toFixed(2)}{item.taxLike ? ' · tax/tip' : ''}</p>
                    </div>
                    {!item.taxLike && (
                      <select
                        value={String(receiptAssignments[index] || '')}
                        onChange={(e) => setReceiptAssignments({ ...receiptAssignments, [index]: e.target.value })}
                        className="px-2 py-1 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white"
                      >
                        <option value="">Assign</option>
                        {groupMembers.map((member) => (
                          <option key={member.id} value={String(member.id)}>{member.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={applyReceiptAssignments}
                  className="w-full px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-semibold"
                >
                  Apply Itemized Split
                </button>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Payment Date
          </label>
          <input
            type="date"
            value={subEventDate}
            onChange={(e) => setSubEventDate(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Paid by
          </label>
          <select
            value={String(payerId)}
            onChange={(e) => setPayerId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            required
          >
            <option value="">-- Select payer --</option>
            {groupMembers.map((m) => (
              <option key={m.id} value={String(m.id)}>{m.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Total Amount (₹)
          </label>
          <input
            type="number"
            step="0.01"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="0.00"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Split Type
          </label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="EQUAL"
                checked={splitType === 'EQUAL'}
                onChange={() => setSplitType('EQUAL')}
                className="mr-2"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Equal Split</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="CUSTOM"
                checked={splitType === 'CUSTOM'}
                onChange={() => setSplitType('CUSTOM')}
                className="mr-2"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Custom Amounts</span>
            </label>
          </div>
        </div>

        {/* Recurring Payment Option */}
        <div className={`space-y-3 p-4 rounded-xl border-2 transition-colors ${
          isRecurring
            ? 'bg-purple-50 dark:bg-purple-950/20 border-purple-300 dark:border-purple-800'
            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => {
                setIsRecurring(e.target.checked);
                if (e.target.checked) setRecurringPeriod('MONTHLY');
              }}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500"
            />
            <div>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                ♻️ Make this a Monthly Recurring Payment
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                This payment will be automatically re-created every 30 days
              </p>
            </div>
          </label>

          {isRecurring && (
            <div className="bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800/50 rounded-lg p-3 mt-2">
              <p className="text-xs text-purple-700 dark:text-purple-300 font-medium flex items-center gap-1.5 mb-1">
                ℹ️ How recurring payments work
              </p>
              <ul className="text-xs text-purple-600 dark:text-purple-400 space-y-1 list-disc list-inside">
                <li>A new payment copy is auto-added <b>every 30 days</b></li>
                <li>The original is marked with a ♻️ badge in the payments list</li>
                <li>Each copy starts as <b>PENDING</b> — members must mark it paid</li>
                <li>You can stop recurrence from the payment's menu or by deleting it</li>
              </ul>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {splitType === 'EQUAL' ? 'Select Sharers' : 'Select Sharers & Enter Custom Amounts'}
          </label>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {splitType === 'CUSTOM' ? (
              selectedSharers.length > 0 ? (
                selectedSharers.map((sharerId) => {
                  const member = groupMembers.find(m => m.id === sharerId);
                  if (!member) return null;
                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 bg-green-50 dark:bg-gray-700 rounded-lg border-2 border-primary-200 dark:border-primary-800"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <button
                          type="button"
                          onClick={() => toggleSharer(member.id)}
                          className="text-red-500 hover:text-red-700 font-bold"
                        >
                          ✕
                        </button>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {member.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          value={customAmounts[member.id] || ''}
                          onChange={(e) => handleCustomAmountChange(member.id, e.target.value)}
                          className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-600 text-gray-900 dark:text-white text-sm"
                          placeholder="0.00"
                          required
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  Select users below to add custom amounts
                </p>
              )
            ) : (
              groupMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <label className="flex items-center gap-3 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSharers.includes(member.id)}
                      onChange={() => toggleSharer(member.id)}
                      className="w-4 h-4 accent-primary-600"
                    />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {member.name}
                    </span>
                    {selectedSharers.includes(member.id) && (
                      <span className="text-sm text-primary-600 dark:text-primary-400 ml-auto font-semibold">
                        ₹{equalShare.toFixed(2)}
                      </span>
                    )}
                  </label>
                </div>
              ))
            )}
          </div>
          {splitType === 'CUSTOM' && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Add more sharers:</p>
              <div className="flex flex-wrap gap-2">
                {groupMembers
                  .filter(m => !selectedSharers.includes(m.id))
                  .map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleSharer(member.id)}
                      className="px-3 py-1 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-full hover:bg-primary-50 hover:border-primary-600 hover:bg-green-50 dark:hover:bg-gray-600 transition-colors"
                    >
                      + {member.name}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Create Payment')}
        </button>
      </form>
    </Modal>
  );
};
