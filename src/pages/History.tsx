import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getTransactions, clearTransactions, Transaction } from "@/types/transaction";
import { ArrowRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const History = () => {
  const [transactions, setTransactions] = useState<Transaction[]>(getTransactions());

  const handleClearHistory = () => {
    clearTransactions();
    setTransactions([]);
    toast.success("Đã xóa lịch sử giao dịch");
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-[calc(100vh-73px)] bg-gradient-bg p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Lịch sử giao dịch</h1>
            <p className="text-muted-foreground">
              Tất cả các giao dịch hoán đổi của bạn
            </p>
          </div>
          
          {transactions.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Xóa lịch sử
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Xác nhận xóa lịch sử</AlertDialogTitle>
                  <AlertDialogDescription>
                    Hành động này không thể hoàn tác. Tất cả lịch sử giao dịch sẽ bị xóa vĩnh viễn.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Hủy</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearHistory} className="bg-destructive hover:bg-destructive/90">
                    Xóa
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <Card className="bg-card/80 backdrop-blur-xl border-glass overflow-hidden">
          {transactions.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-muted-foreground text-lg mb-4">
                Chưa có giao dịch nào
              </div>
              <p className="text-sm text-muted-foreground">
                Các giao dịch hoán đổi của bạn sẽ xuất hiện ở đây
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Thời gian</TableHead>
                    <TableHead>Giao dịch</TableHead>
                    <TableHead className="text-right">Tỷ giá</TableHead>
                    <TableHead className="text-right">Slippage</TableHead>
                    <TableHead className="text-right">Giá trị</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {formatDate(tx.timestamp)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            <img 
                              src={tx.fromToken.logo} 
                              alt={tx.fromToken.symbol}
                              className="w-6 h-6 rounded-full"
                            />
                            <div>
                              <div className="font-medium">{tx.fromToken.amount}</div>
                              <div className="text-xs text-muted-foreground">{tx.fromToken.symbol}</div>
                            </div>
                          </div>
                          
                          <ArrowRight className="h-4 w-4 text-muted-foreground mx-1" />
                          
                          <div className="flex items-center gap-1.5">
                            <img 
                              src={tx.toToken.logo} 
                              alt={tx.toToken.symbol}
                              className="w-6 h-6 rounded-full"
                            />
                            <div>
                              <div className="font-medium">{tx.toToken.amount}</div>
                              <div className="text-xs text-muted-foreground">{tx.toToken.symbol}</div>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {tx.exchangeRate.toFixed(6)}
                      </TableCell>
                      <TableCell className="text-right">
                        {tx.slippage}%
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ${tx.valueUsd.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default History;
