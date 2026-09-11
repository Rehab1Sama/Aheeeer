import { useState } from "react";
import {
  useListStoreProducts, useCreateStoreProduct, useUpdateStoreProduct, useDeleteStoreProduct
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ShoppingBag, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StoreForm {
  title: string; description: string; price: string; imageUrl: string;
  whatsappNumber: string; category: string; isActive: boolean; displayOrder: number;
}

const emptyForm: StoreForm = {
  title: "", description: "", price: "", imageUrl: "", whatsappNumber: "", category: "", isActive: true, displayOrder: 0,
};

export default function StoreManagePage() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<StoreForm>(emptyForm);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: products = [], isLoading } = useListStoreProducts({});
  const createMutation = useCreateStoreProduct();
  const updateMutation = useUpdateStoreProduct();
  const deleteMutation = useDeleteStoreProduct();

  function invalidate() { qc.invalidateQueries({ queryKey: ["listStoreProducts"] }); }

  function openNew() { setEditingId(null); setForm(emptyForm); setShowDialog(true); }
  function openEdit(p: any) {
    setEditingId(p.id);
    setForm({ title: p.title, description: p.description ?? "", price: p.price, imageUrl: p.imageUrl ?? "", whatsappNumber: p.whatsappNumber, category: p.category ?? "", isActive: p.isActive, displayOrder: p.displayOrder });
    setShowDialog(true);
  }

  async function handleSave() {
    if (!form.title || !form.price || !form.whatsappNumber) {
      toast({ title: "الاسم والسعر ورقم الواتساب مطلوبة", variant: "destructive" }); return;
    }
    try {
      const payload = {
        title: form.title, price: form.price, whatsappNumber: form.whatsappNumber,
        description: form.description || null, imageUrl: form.imageUrl || null,
        category: form.category || null, isActive: form.isActive, displayOrder: form.displayOrder,
      };
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data: payload });
      } else {
        await createMutation.mutateAsync({ data: payload });
      }
      invalidate();
      setShowDialog(false);
      toast({ title: "تم الحفظ" });
    } catch { toast({ title: "حدث خطأ", variant: "destructive" }); }
  }

  async function handleDelete(id: number) {
    if (!confirm("هل تريدين حذف هذا المنتج؟")) return;
    await deleteMutation.mutateAsync({ id });
    invalidate();
    toast({ title: "تم الحذف" });
  }

  return (
    <div className="p-4 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <ShoppingBag className="w-6 h-6" />إدارة المتجر
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/store" target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4 ml-1" />معاينة المتجر</a>
          </Button>
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 ml-1" />منتج جديد</Button>
        </div>
      </div>

      {isLoading && <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>}

      {!isLoading && products.length === 0 && (
        <div className="text-center py-20">
          <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground mb-4">لا توجد منتجات بعد</p>
          <Button onClick={openNew}><Plus className="w-4 h-4 ml-1" />أضف أول منتج</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map(p => (
          <div key={p.id} className={`rounded-xl border bg-card p-4 ${!p.isActive ? "opacity-60" : ""}`}>
            {p.imageUrl && (
              <div className="aspect-video rounded-lg overflow-hidden mb-3 bg-muted">
                <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-bold">{p.title}</h3>
              {!p.isActive && <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">مخفي</span>}
            </div>
            {p.category && <div className="text-xs text-muted-foreground mb-1">📂 {p.category}</div>}
            {p.description && <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{p.description}</p>}
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-primary">{p.price}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "تعديل المنتج" : "منتج جديد"}</DialogTitle></DialogHeader>
          <div className="space-y-4 overflow-y-auto max-h-[70vh]">
            <div><Label>اسم المنتج *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>الوصف</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>السعر *</Label><Input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="٥٠ ريال" /></div>
              <div><Label>التصنيف</Label><Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="كتب، لوازم..." /></div>
            </div>
            <div><Label>رقم الواتساب *</Label><Input value={form.whatsappNumber} onChange={e => setForm(f => ({ ...f, whatsappNumber: e.target.value }))} placeholder="966xxxxxxxxx" dir="ltr" /></div>
            <div><Label>رابط الصورة</Label><Input value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." dir="ltr" /></div>
            {form.imageUrl && (
              <img src={form.imageUrl} alt="preview" className="w-full aspect-video object-cover rounded-lg" onError={e => ((e.target as any).style.display = "none")} />
            )}
            <div><Label>الترتيب</Label><Input type="number" value={form.displayOrder} onChange={e => setForm(f => ({ ...f, displayOrder: parseInt(e.target.value) || 0 }))} /></div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
              <Label>ظاهر في المتجر</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
