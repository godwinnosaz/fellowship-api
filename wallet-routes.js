// ============================================================================
// WALLET SYSTEM - UNIT WALLETS & VPAY INTEGRATION
// ============================================================================

// Approval chain definition
const APPROVAL_CHAIN = [
    { order: 1, role: 'SECRETARY_GENERAL', label: 'Secretary General (Initial)' },
    { order: 2, role: 'PRESIDENCY', label: 'President' },
    { order: 3, role: 'VICE_PRESIDENT', label: 'Vice President' },
    { order: 4, role: 'SECRETARY_GENERAL', label: 'Secretary General (Final)' },
    { order: 5, role: 'FINANCIAL_SECRETARY', label: 'Financial Secretary' }
];

// ============================================================================
// WALLET MANAGEMENT
// ============================================================================

// Get all unit wallets for a fellowship
app.get('/api/wallets', authenticateToken, async (req, res) => {
    const { fellowshipId } = req.query;

    try {
        const wallets = await prisma.unitWallet.findMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            include: {
                _count: {
                    select: {
                        transactions: true,
                        donations: true
                    }
                }
            },
            orderBy: { unitDepartment: 'asc' }
        });

        res.json(wallets);
    } catch (error) {
        console.error('Get wallets error:', error);
        res.status(500).json({ error: 'Failed to fetch wallets' });
    }
});

// Get specific wallet by ID
app.get('/api/wallets/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const wallet = await prisma.unitWallet.findUnique({
            where: { id: parseInt(id) },
            include: {
                transactions: {
                    orderBy: { createdAt: 'desc' },
                    take: 20
                },
                donations: {
                    include: {
                        member: {
                            select: { id: true, name: true, email: true }
                        }
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 20
                }
            }
        });

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        res.json(wallet);
    } catch (error) {
        console.error('Get wallet error:', error);
        res.status(500).json({ error: 'Failed to fetch wallet' });
    }
});

// Get wallet by department
app.get('/api/wallets/department/:department', authenticateToken, async (req, res) => {
    const { department } = req.params;
    const { fellowshipId } = req.query;

    try {
        const wallet = await prisma.unitWallet.findUnique({
            where: {
                fellowshipId_unitDepartment: {
                    fellowshipId: parseInt(fellowshipId),
                    unitDepartment: department.toUpperCase()
                }
            },
            include: {
                transactions: {
                    orderBy: { createdAt: 'desc' },
                    take: 10
                },
                donations: {
                    include: {
                        member: {
                            select: { id: true, name: true }
                        }
                    },
                    where: { isAnonymous: false },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                }
            }
        });

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found for this department' });
        }

        res.json(wallet);
    } catch (error) {
        console.error('Get wallet by department error:', error);
        res.status(500).json({ error: 'Failed to fetch wallet' });
    }
});

// Create wallet for a unit
app.post('/api/wallets', authenticateToken, authorizeRoles('EXECUTIVE', 'SUPER_ADMIN'), async (req, res) => {
    const { fellowshipId, unitDepartment } = req.body;

    try {
        // Check if wallet already exists
        const existing = await prisma.unitWallet.findUnique({
            where: {
                fellowshipId_unitDepartment: {
                    fellowshipId: parseInt(fellowshipId),
                    unitDepartment: unitDepartment.toUpperCase()
                }
            }
        });

        if (existing) {
            return res.status(400).json({ error: 'Wallet already exists for this department' });
        }

        const wallet = await prisma.unitWallet.create({
            data: {
                fellowshipId: parseInt(fellowshipId),
                unitDepartment: unitDepartment.toUpperCase(),
                balance: 0.00
            }
        });

        // TODO: Create VPay virtual account
        // const vpayAccount = await createVPayVirtualAccount(fellowship, unitDepartment);
        // await prisma.unitWallet.update({
        //     where: { id: wallet.id },
        //     data: {
        //         vpayVirtualAccount: vpayAccount.accountNumber,
        //         vpayAccountName: vpayAccount.accountName
        //     }
        // });

        res.json(wallet);
    } catch (error) {
        console.error('Create wallet error:', error);
        res.status(500).json({ error: 'Failed to create wallet' });
    }
});

// ============================================================================
// DONATIONS
// ============================================================================

// Record a donation (called by VPay webhook or manual entry)
app.post('/api/donations', authenticateToken, async (req, res) => {
    const { walletId, memberId, amount, paymentMethod, donationNote, vpayReference } = req.body;

    try {
        const wallet = await prisma.unitWallet.findUnique({
            where: { id: parseInt(walletId) }
        });

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        // Calculate commissions (VPay 1.5% + Brainiac 0.5%)
        const vpayFee = paymentMethod === 'VPAY_TRANSFER' ? amount * 0.015 : 0;
        const brainiacCut = paymentMethod === 'VPAY_TRANSFER' ? amount * 0.005 : 0;
        const netAmount = amount - vpayFee - brainiacCut;

        // Create donation record
        const donation = await prisma.memberDonation.create({
            data: {
                walletId: parseInt(walletId),
                memberId: parseInt(memberId),
                amount: netAmount,
                paymentMethod: paymentMethod || 'VPAY_TRANSFER',
                vpayReference,
                donationNote
            }
        });

        // Create transaction record
        const transaction = await prisma.walletTransaction.create({
            data: {
                walletId: parseInt(walletId),
                transactionType: 'DEPOSIT',
                amount: netAmount,
                description: `Donation from member${donationNote ? ': ' + donationNote : ''}`,
                vpayReference,
                status: 'COMPLETED',
                completedAt: new Date()
            }
        });

        // Update wallet balance
        await prisma.unitWallet.update({
            where: { id: parseInt(walletId) },
            data: {
                balance: { increment: netAmount }
            }
        });

        // Record commission if VPay payment
        if (paymentMethod === 'VPAY_TRANSFER' && brainiacCut > 0) {
            await prisma.brainiacCommission.create({
                data: {
                    fellowshipId: wallet.fellowshipId,
                    transactionId: transaction.id,
                    originalAmount: amount,
                    vpayFee,
                    brainiacCut,
                    netAmount,
                    commissionRate: 0.005
                }
            });
        }

        // TODO: Send SMS notification to unit head
        // await sendSMS(unitHead.phone, `New donation of ₦${netAmount} received!`);

        res.json({ donation, transaction, netAmount });
    } catch (error) {
        console.error('Record donation error:', error);
        res.status(500).json({ error: 'Failed to record donation' });
    }
});

// Get donations for a wallet
app.get('/api/donations/wallet/:walletId', authenticateToken, async (req, res) => {
    const { walletId } = req.params;
    const { limit = 50 } = req.query;

    try {
        const donations = await prisma.memberDonation.findMany({
            where: { walletId: parseInt(walletId) },
            include: {
                member: {
                    select: { id: true, name: true, email: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit)
        });

        res.json(donations);
    } catch (error) {
        console.error('Get donations error:', error);
        res.status(500).json({ error: 'Failed to fetch donations' });
    }
});

// ============================================================================
// WITHDRAWALS & APPROVAL WORKFLOW
// ============================================================================

// Initiate withdrawal request
app.post('/api/withdrawals/request', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { walletId, amount, description } = req.body;

    try {
        const wallet = await prisma.unitWallet.findUnique({
            where: { id: parseInt(walletId) }
        });

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        // Check if sufficient balance
        if (wallet.balance < amount) {
            return res.status(400).json({ error: 'Insufficient wallet balance' });
        }

        // Check if user is unit head for this department
        if (req.user.department !== wallet.unitDepartment) {
            return res.status(403).json({ error: 'Only unit heads can request withdrawals for their department' });
        }

        // Create withdrawal transaction
        const transaction = await prisma.walletTransaction.create({
            data: {
                walletId: parseInt(walletId),
                transactionType: 'WITHDRAWAL',
                amount: parseFloat(amount),
                description,
                initiatedById: req.user.id,
                status: 'PENDING'
            }
        });

        // Create approval chain
        for (const step of APPROVAL_CHAIN) {
            await prisma.transactionApproval.create({
                data: {
                    transactionId: transaction.id,
                    approverRole: step.role,
                    approvalOrder: step.order,
                    approvalStatus: 'PENDING'
                }
            });
        }

        // TODO: Notify first approver (Secretary General)
        // const secGen = await findUserByRole(wallet.fellowshipId, 'SECRETARY_GENERAL');
        // await sendNotification(secGen, `New withdrawal request of ₦${amount}`);

        res.json({ transaction, message: 'Withdrawal request submitted for approval' });
    } catch (error) {
        console.error('Initiate withdrawal error:', error);
        res.status(500).json({ error: 'Failed to initiate withdrawal' });
    }
});

// Get pending approvals for current user
app.get('/api/withdrawals/pending-approvals', authenticateToken, async (req, res) => {
    const { fellowshipId } = req.query;

    try {
        // Find approvals pending for user's role
        const approvals = await prisma.transactionApproval.findMany({
            where: {
                approverRole: req.user.role,
                approvalStatus: 'PENDING',
                transaction: {
                    wallet: {
                        fellowshipId: parseInt(fellowshipId)
                    }
                }
            },
            include: {
                transaction: {
                    include: {
                        wallet: true,
                        initiatedBy: {
                            select: { name: true, email: true, department: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        });

        // Filter to only show approvals where previous steps are complete
        const pendingApprovals = [];
        for (const approval of approvals) {
            const previousApprovals = await prisma.transactionApproval.findMany({
                where: {
                    transactionId: approval.transactionId,
                    approvalOrder: { lt: approval.approvalOrder }
                }
            });

            const allPreviousApproved = previousApprovals.every(a => a.approvalStatus === 'APPROVED');
            if (allPreviousApproved) {
                pendingApprovals.push(approval);
            }
        }

        res.json(pendingApprovals);
    } catch (error) {
        console.error('Get pending approvals error:', error);
        res.status(500).json({ error: 'Failed to fetch pending approvals' });
    }
});

// Approve withdrawal
app.post('/api/withdrawals/approve/:id', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { id } = req.params;
    const { comments } = req.body;

    try {
        const approval = await prisma.transactionApproval.findFirst({
            where: {
                transactionId: parseInt(id),
                approverRole: req.user.role,
                approvalStatus: 'PENDING'
            },
            include: {
                transaction: {
                    include: { wallet: true }
                }
            }
        });

        if (!approval) {
            return res.status(404).json({ error: 'Approval not found or already processed' });
        }

        // Check if previous approvals are complete
        const previousApprovals = await prisma.transactionApproval.findMany({
            where: {
                transactionId: parseInt(id),
                approvalOrder: { lt: approval.approvalOrder }
            }
        });

        const allPreviousApproved = previousApprovals.every(a => a.approvalStatus === 'APPROVED');
        if (!allPreviousApproved) {
            return res.status(400).json({ error: 'Previous approvals not complete' });
        }

        // Mark as approved
        await prisma.transactionApproval.update({
            where: { id: approval.id },
            data: {
                approvalStatus: 'APPROVED',
                approverId: req.user.id,
                comments,
                approvedAt: new Date()
            }
        });

        // Check if this was the final approval
        const remainingApprovals = await prisma.transactionApproval.count({
            where: {
                transactionId: parseInt(id),
                approvalStatus: 'PENDING'
            }
        });

        if (remainingApprovals === 0) {
            // All approvals complete! Update transaction status
            await prisma.walletTransaction.update({
                where: { id: parseInt(id) },
                data: { status: 'APPROVED' }
            });

            // TODO: Trigger VPay outward transfer
            // await disburseWithdrawal(id);

            res.json({ message: 'Final approval complete. Disbursement initiated.' });
        } else {
            // Notify next approver
            const nextApproval = await prisma.transactionApproval.findFirst({
                where: {
                    transactionId: parseInt(id),
                    approvalStatus: 'PENDING'
                },
                orderBy: { approvalOrder: 'asc' }
            });

            // TODO: Send notification to next approver
            res.json({ message: 'Approval recorded. Pending next approver.', nextApprover: nextApproval.approverRole });
        }
    } catch (error) {
        console.error('Approve withdrawal error:', error);
        res.status(500).json({ error: 'Failed to approve withdrawal' });
    }
});

// Reject withdrawal
app.post('/api/withdrawals/reject/:id', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { id } = req.params;
    const { comments } = req.body;

    try {
        const approval = await prisma.transactionApproval.findFirst({
            where: {
                transactionId: parseInt(id),
                approverRole: req.user.role,
                approvalStatus: 'PENDING'
            }
        });

        if (!approval) {
            return res.status(404).json({ error: 'Approval not found or already processed' });
        }

        // Mark as rejected
        await prisma.transactionApproval.update({
            where: { id: approval.id },
            data: {
                approvalStatus: 'REJECTED',
                approverId: req.user.id,
                comments,
                approvedAt: new Date()
            }
        });

        // Update transaction status
        await prisma.walletTransaction.update({
            where: { id: parseInt(id) },
            data: {
                status: 'REJECTED',
                failureReason: comments
            }
        });

        // TODO: Notify initiator of rejection
        res.json({ message: 'Withdrawal request rejected' });
    } catch (error) {
        console.error('Reject withdrawal error:', error);
        res.status(500).json({ error: 'Failed to reject withdrawal' });
    }
});

// ============================================================================
// FINANCIAL SECRETARY - OVERSIGHT
// ============================================================================

// Get all transactions across all wallets (Financial Secretary only)
app.get('/api/wallets/transactions/all', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { fellowshipId, startDate, endDate, transactionType } = req.query;

    // Verify user is Financial Secretary
    if (req.user.department !== 'FINANCE' && req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Access restricted to Financial Secretary' });
    }

    try {
        const where = {
            wallet: {
                fellowshipId: parseInt(fellowshipId)
            }
        };

        if (transactionType) {
            where.transactionType = transactionType;
        }

        if (startDate && endDate) {
            where.createdAt = {
                gte: new Date(startDate),
                lte: new Date(endDate)
            };
        }

        const transactions = await prisma.walletTransaction.findMany({
            where,
            include: {
                wallet: {
                    select: { unitDepartment: true, balance: true }
                },
                initiatedBy: {
                    select: { name: true, department: true }
                },
                approvals: {
                    include: {
                        approver: {
                            select: { name: true, role: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(transactions);
    } catch (error) {
        console.error('Get all transactions error:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// Get commission report (Brainiac Group revenue)
app.get('/api/commissions/report', authenticateToken, authorizeRoles('SUPER_ADMIN'), async (req, res) => {
    const { fellowshipId, startDate, endDate } = req.query;

    try {
        const where = {};

        if (fellowshipId) {
            where.fellowshipId = parseInt(fellowshipId);
        }

        if (startDate && endDate) {
            where.createdAt = {
                gte: new Date(startDate),
                lte: new Date(endDate)
            };
        }

        const commissions = await prisma.brainiacCommission.findMany({
            where,
            include: {
                fellowship: {
                    select: { name: true, code: true }
                },
                transaction: {
                    select: { description: true, createdAt: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const totalCommission = commissions.reduce((sum, c) => sum + c.brainiacCut, 0);
        const totalVpayFees = commissions.reduce((sum, c) => sum + c.vpayFee, 0);
        const totalProcessed = commissions.reduce((sum, c) => sum + c.originalAmount, 0);

        res.json({
            commissions,
            summary: {
                totalCommission,
                totalVpayFees,
                totalProcessed,
                count: commissions.length
            }
        });
    } catch (error) {
        console.error('Get commission report error:', error);
        res.status(500).json({ error: 'Failed to fetch commission report' });
    }
});

// ============================================================================
// VPAY WEBHOOK
// ============================================================================

// VPay webhook for incoming payments
app.post('/api/webhooks/vpay', async (req, res) => {
    const { account_number, amount, reference, payer_name, payer_phone } = req.body;

    try {
        // TODO: Verify VPay webhook signature
        // const isValid = verifyVPaySignature(req);
        // if (!isValid) {
        //     return res.status(401).json({ error: 'Invalid webhook signature' });
        // }

        // Find wallet by virtual account number
        const wallet = await prisma.unitWallet.findUnique({
            where: { vpayVirtualAccount: account_number },
            include: { fellowship: true }
        });

        if (!wallet) {
            console.error('Wallet not found for account:', account_number);
            return res.status(404).json({ error: 'Wallet not found' });
        }

        // Try to find member by phone or name
        const member = await prisma.user.findFirst({
            where: {
                fellowshipId: wallet.fellowshipId,
                OR: [
                    { email: { contains: payer_name } },
                    { name: { contains: payer_name } }
                ]
            }
        });

        // Calculate commissions
        const vpayFee = amount * 0.015; //  1.5%
        const brainiacCut = amount * 0.005; // 0.5%
        const netAmount = amount - vpayFee - brainiacCut;

        // Record donation
        const donation = await prisma.memberDonation.create({
            data: {
                walletId: wallet.id,
                memberId: member?.id || null,
                amount: netAmount,
                paymentMethod: 'VPAY_TRANSFER',
                vpayReference: reference,
                donationNote: `Payment from ${payer_name}`
            }
        });

        // Create transaction
        const transaction = await prisma.walletTransaction.create({
            data: {
                walletId: wallet.id,
                transactionType: 'DEPOSIT',
                amount: netAmount,
                description: `VPay transfer from ${payer_name}`,
                vpayReference: reference,
                status: 'COMPLETED',
                completedAt: new Date()
            }
        });

        // Update wallet balance
        await prisma.unitWallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: netAmount } }
        });

        // Record commission
        await prisma.brainiacCommission.create({
            data: {
                fellowshipId: wallet.fellowshipId,
                transactionId: transaction.id,
                originalAmount: amount,
                vpayFee,
                brainiacCut,
                netAmount
            }
        });

        // TODO: Send SMS to unit head
        // const unitHead = await prisma.user.findFirst({
        //     where: {
        //         fellowshipId: wallet.fellowshipId,
        //         department: wallet.unitDepartment,
        //         role: 'EXECUTIVE'
        //     }
        // });
        // await sendSMS(unitHead.phone, `New donation of ₦${netAmount} received!`);

        res.json({ success: true, netAmount });
    } catch (error) {
        console.error('VPay webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});
