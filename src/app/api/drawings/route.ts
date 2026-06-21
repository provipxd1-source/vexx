import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const drawings = await db.drawing.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json(drawings);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch drawings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, author, imageData, width, height } = body;

    if (!title || !author || !imageData) {
      return NextResponse.json(
        { error: 'Missing required fields: title, author, imageData' },
        { status: 400 }
      );
    }

    const drawing = await db.drawing.create({
      data: {
        title,
        author,
        imageData,
        width: width || 800,
        height: height || 600,
      },
    });

    return NextResponse.json(drawing, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to save drawing' }, { status: 500 });
  }
}