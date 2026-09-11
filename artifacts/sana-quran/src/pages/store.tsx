import { useListStoreProducts } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ShoppingBag, MessageCircle, Tag } from "lucide-react";
import logoUrl from "@/assets/logo.jpg";

export default function StorePage() {
  const { data: products = [], isLoading } = useListStoreProducts({ activeOnly: true });

  function openWhatsApp(phone: string, title: string) {
    const msg = encodeURIComponent(`السلام عليكم، أريد الاستفسار عن: ${title}`);
    const cleaned = phone.replace(/\D/g, "");
    window.open(`https://wa.me/${cleaned}?text=${msg}`, "_blank");
  }

  const categories: string[] = Array.from(new Set(products.map(p => ((p.category as string | null | undefined) ?? "عام")))).filter(Boolean) as string[];

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%)" }} dir="rtl">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center mb-10">
          <img src={logoUrl} alt="سنا الآي" className="w-20 h-20 mx-auto mb-4 rounded-2xl shadow-lg object-cover" />
          <h1 className="text-3xl font-bold text-primary mb-2">متجر مقرأة سنا الآي</h1>
          <p className="text-muted-foreground">مواد تعليمية ومستلزمات الحلقات القرآنية</p>
        </div>

        {isLoading && (
          <div className="text-center py-20">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-muted-foreground">جاري التحميل...</p>
          </div>
        )}

        {!isLoading && products.length === 0 && (
          <div className="text-center py-20">
            <ShoppingBag className="w-16 h-16 mx-auto mb-4 text-muted-foreground/40" />
            <p className="text-muted-foreground text-lg">لا توجد منتجات متاحة حاليًا</p>
          </div>
        )}

        {categories.map(cat => {
          const catProducts = products.filter(p => (p.category ?? "عام") === cat);
          return (
            <div key={cat} className="mb-10">
              {categories.length > 1 && (
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Tag className="w-5 h-5 text-primary" />{cat}
                </h2>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {catProducts.map(p => (
                  <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden flex flex-col transition-transform hover:-translate-y-0.5 hover:shadow-md">
                    {p.imageUrl ? (
                      <div className="aspect-video bg-muted overflow-hidden">
                        <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="aspect-video bg-gradient-to-br from-primary/10 to-teal-100 flex items-center justify-center">
                        <ShoppingBag className="w-12 h-12 text-primary/40" />
                      </div>
                    )}
                    <div className="p-4 flex-1 flex flex-col">
                      <h3 className="font-bold text-lg mb-1">{p.title}</h3>
                      {p.description && <p className="text-sm text-muted-foreground mb-3 flex-1">{p.description}</p>}
                      <div className="flex items-center justify-between mt-auto pt-3 border-t border-border">
                        <span className="text-xl font-bold text-primary">{p.price}</span>
                        <Button
                          size="sm"
                          className="bg-green-500 hover:bg-green-600 text-white"
                          onClick={() => openWhatsApp(p.whatsappNumber, p.title)}
                        >
                          <MessageCircle className="w-4 h-4 ml-1" /> واتساب
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
