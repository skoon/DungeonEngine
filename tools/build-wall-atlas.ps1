param(
  [Parameter(Mandatory = $true)]
  [string]$Source,

  [Parameter(Mandatory = $true)]
  [string]$Output
)

$ErrorActionPreference = 'Stop'

$drawingAssemblies = @(
  (Join-Path $PSHOME 'System.Drawing.Primitives.dll'),
  (Join-Path $PSHOME 'System.Drawing.Common.dll'),
  (Join-Path $PSHOME 'System.Private.Windows.GdiPlus.dll'),
  (Join-Path $PSHOME 'System.Private.Windows.Core.dll')
)

Add-Type -ReferencedAssemblies $drawingAssemblies -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;

public static class DungeonWallAtlasBuilder
{
    private static readonly Color[] Palette = new[]
    {
        Color.FromArgb(255, 0x1a, 0x1c, 0x2c),
        Color.FromArgb(255, 0x33, 0x3c, 0x57),
        Color.FromArgb(255, 0x5d, 0x27, 0x5d),
        Color.FromArgb(255, 0xb1, 0x3e, 0x53),
        Color.FromArgb(255, 0xef, 0x7d, 0x57),
        Color.FromArgb(255, 0xff, 0xcd, 0x75)
    };

    private static Color Quantize(Color input, double shade)
    {
        int r = (int)Math.Round(input.R * shade);
        int g = (int)Math.Round(input.G * shade);
        int b = (int)Math.Round(input.B * shade);
        Color best = Palette[0];
        long bestDistance = long.MaxValue;
        foreach (Color candidate in Palette)
        {
            long dr = r - candidate.R;
            long dg = g - candidate.G;
            long db = b - candidate.B;
            long distance = dr * dr + dg * dg + db * db;
            if (distance < bestDistance)
            {
                bestDistance = distance;
                best = candidate;
            }
        }
        return best;
    }

    private static Color Sample(Bitmap source, double u, double v, double shade)
    {
        int x = Math.Max(0, Math.Min(source.Width - 1, (int)Math.Floor(u * source.Width)));
        int y = Math.Max(0, Math.Min(source.Height - 1, (int)Math.Floor(v * source.Height)));
        return Quantize(source.GetPixel(x, y), shade);
    }

    private static void DrawFront(Bitmap atlas, Bitmap source, int dx, int dy, int width, int height, double shade)
    {
        for (int y = 0; y < height; y++)
        {
            double v = (y + 0.5) / height;
            for (int x = 0; x < width; x++)
            {
                double u = (x + 0.5) / width;
                atlas.SetPixel(dx + x, dy + y, Sample(source, u, v, shade));
            }
        }
    }

    private static void DrawSide(Bitmap atlas, Bitmap source, int dx, int dy, int width, int height, int farHeight, double shade)
    {
        for (int x = 0; x < width; x++)
        {
            double t = width == 1 ? 1.0 : (double)x / (width - 1);
            double columnHeight = farHeight + (height - farHeight) * t;
            double top = (height - columnHeight) / 2.0;
            double bottom = top + columnHeight;
            for (int y = 0; y < height; y++)
            {
                double py = y + 0.5;
                if (py < top || py >= bottom) continue;
                double u = Math.Pow(t, 0.72);
                double v = (py - top) / columnHeight;
                atlas.SetPixel(dx + x, dy + y, Sample(source, u, v, shade));
            }
        }
    }

    public static void Build(string sourcePath, string outputPath)
    {
        using (var source = new Bitmap(sourcePath))
        using (var atlas = new Bitmap(512, 1024, PixelFormat.Format32bppArgb))
        {
            DrawFront(atlas, source, 0, 0, 300, 300, 1.00);
            DrawSide(atlas, source, 300, 0, 191, 682, 300, 0.84);

            DrawFront(atlas, source, 0, 300, 100, 100, 0.82);
            DrawSide(atlas, source, 100, 300, 100, 300, 100, 0.68);

            DrawFront(atlas, source, 0, 400, 60, 60, 0.66);
            DrawSide(atlas, source, 60, 400, 20, 100, 60, 0.52);

            DrawFront(atlas, source, 0, 460, 44, 44, 0.52);
            DrawSide(atlas, source, 44, 460, 9, 60, 44, 0.42);

            atlas.Save(outputPath, ImageFormat.Png);
        }
    }
}
'@

[DungeonWallAtlasBuilder]::Build(
  (Resolve-Path -LiteralPath $Source).Path,
  [System.IO.Path]::GetFullPath($Output)
)
